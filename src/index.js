const core = require('@actions/core');
const { CogniteClient } = require('@cognite/sdk');
const AdmZip = require('adm-zip');

const zip = new AdmZip();

// VARS
const CDF_BASE_URL =
  process.env.INPUT_CDF_BASE_URL || 'https://api.cognitedata.com';

const CDF_PROJECT = process.env.INPUT_CDF_PROJECT;

const CDF_CREDENTIALS = process.env.INPUT_CDF_CREDENTIALS;

const FUNCTION_PATH = process.env.INPUT_FUNCTION_PATH;

const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;

const GITHUB_EVENT_NAME = process.env.GITHUB_EVENT_NAME;

const GITHUB_REF = process.env.GITHUB_REF;

const GITHUB_SHA = process.env.GITHUB_SHA.substring(0,7);

const GITHUB_HEAD_REF = process.env.GITHUB_HEAD_REF;

const DELETE_PR_DEPLOYMENT = process.env.DELETE_PR_DEPLOYMENT

console.log(`Handling event ${GITHUB_EVENT_NAME} on ${GITHUB_REF}`);

const sdk = new CogniteClient({
  baseUrl: CDF_BASE_URL,
  appId: 'deploy-function-action',
});

if (!(CDF_PROJECT && CDF_CREDENTIALS)) {
  core.setFailed(
    `Missing required variables ${
      CDF_PROJECT ? `CDF_PROJECT` : `CDF_CREDENTIALS`
    }`
  );
  process.exit(1);
}

sdk.loginWithApiKey({ apiKey: CDF_CREDENTIALS, project: CDF_PROJECT });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadSourceCode(functionName) {
  const fileName = functionName.replace("/","_")+".zip";
  await zip.addLocalFolder(FUNCTION_PATH);
  const buffer = zip.toBuffer();
  const fileResponse = await sdk.files.upload(
    {
      externalId: functionName,
      name: fileName,
      mimeType: 'application/zip',
    },
    buffer,
    true,
    true
  );

  return fileResponse;
}

async function deleteFunction(externalId) {
  try {
    const functionResponse = await sdk.post(
      `/api/playground/projects/${CDF_PROJECT}/functions/delete`,
      {
        data: {
          items: [
            {
              externalId: externalId
            },
          ],
        },
      }
    );
    console.log(`Successfully deleted function with externalId ${externalId}`);
  } catch (ex) {
    console.log(`Did not delete function: ${ex.errorMessage}`)
  }
}

async function awaitDeployedFunction(externalId, waiting_time_seconds) {
  try {
    now = new Date();
    async function functionIsReady(externalId) {
      const functionResponse = await sdk.post(
        `/api/playground/projects/${CDF_PROJECT}/functions/byids`,
        {
          data: {
            items: [
              {
                externalId: externalId
              },
            ],
          },
        }
      );
      
      const status = functionResponse.data.items[0].status;
      return status === "Ready";
    }
    console.log(`Awaiting function ${externalId} to become ready`);
    while (true) {
      const ready = await functionIsReady(externalId);
      if (ready) {
        return true;
      }

      if (new Date() - now < waiting_time_seconds * 1000) {
        sleep(5000);
      } else {
        return false;
      }
    }
  } catch (ex) {
    core.setFailed(ex.message);
    throw ex;
  }
}

async function deployFunction(fileId, functionName, externalId) {
  try {
    console.log(`Deploying function ${functionName} (${externalId})`);
    const functionResponse = await sdk.post(
      `/api/playground/projects/${CDF_PROJECT}/functions`,
      {
        data: {
          items: [
            {
              name: functionName,
              externalId: externalId,
              fileId: fileId,
            },
          ],
        },
      }
    );

    
    const functionId = functionResponse.data.items[0].id;
    console.log(`Created function with status ${functionResponse.status} with id ${functionId}`);
    core.exportVariable('functionId', `${functionId}`);
    core.exportVariable('functionExternalId', `${externalId}`);
    core.exportVariable('functionName', `${functionName}`);

    const deployed = await awaitDeployedFunction(externalId, 300);
    if (deployed) {
      console.log(`Successfully deployed function ${functionName} with external id ${externalId} and id ${functionId}.`);
    } else {
      console.log(`Failed deploying function ${functionName} with external id ${externalId} and id ${functionId}.`);
    }
    
  } catch (ex) {
    core.setFailed(ex.message);
    throw ex;
  }
}

async function handlePush() {
  const fileResponse = await uploadSourceCode();

  // Deploy function with :sha
  const functionName = `${GITHUB_REPOSITORY}/${FUNCTION_PATH}:${GITHUB_SHA}`
  const externalId = functionName;
  await deleteFunction(externalId);
  await deployFunction(fileResponse.id, functionName, externalId);
  
  // Delete :latest and recreate immediately. This will hopefully be fast
  const functionNameLatest = `${GITHUB_REPOSITORY}/${FUNCTION_PATH}:latest`
  const externalIdLatest = functionNameLatest;
  await deleteFunction(externalIdLatest);
  await deployFunction(fileResponse.id, functionNameLatest, externalIdLatest);
  // Delete function with :sha
  await deleteFunction(externalId);
}

async function handlePR() {
  const functionName = `${GITHUB_REPOSITORY}/${FUNCTION_PATH}/${GITHUB_HEAD_REF}`
  const externalId = functionName;
  console.log(`Deleting potential old PR function ...`);
  await deleteFunction(functionName);
  if (process.env.DELETE_PR_FUNCTION) {
    return;
  }
  console.log(`Uploading source code ...`);
  const fileResponse = await uploadSourceCode();
  console.log(`Redeploying PR function ...`);
  await deployFunction(fileResponse.id, functionName, externalId);
  console.log(`Done.`);
}

async function run() {
  const user = await sdk.login.status();
  if (!user) {
    const message = "Invalid API key."
    core.setFailed(message);
    console.error(message);
    process.exit(1);
  }
  console.log(`Logged in as user ${user.user}`);

  if (GITHUB_EVENT_NAME === "pull_request") {
    await handlePR();
  } else if (GITHUB_EVENT_NAME === "push") {
    await handlePush();
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    core.setFailed(err.message);
    console.error(err);
    process.exit(1);
  });
