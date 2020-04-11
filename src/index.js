const core = require('@actions/core');
const { CogniteClient } = require('@cognite/sdk');
const AdmZip = require('adm-zip');

const zip = new AdmZip();

// VARS
const CDF_BASE_URL =
  process.env.INPUT_CDF_BASE_URL || 'https://api.cognitedata.com';

const CDF_PROJECT = process.env.INPUT_CDF_PROJECT;

const CDF_CREDENTIALS = process.env.INPUT_CDF_CREDENTIALS;

const FUNCTION_PATH = process.env.INPUT_HANDLER_PATH;

const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;

const GITHUB_EVENT_NAME = process.env.GITHUB_EVENT_NAME;

const GITHUB_REF = process.env.GITHUB_REF;

const GITHUB_SHA = process.env.GITHUB_SHA.substring(0,7);

const GITHUB_HEAD_REF = process.env.GITHUB_HEAD_REF;

const DELETE_PR_DEPLOYMENT = process.env.DELETE_PR_DEPLOYMENT

const functionRefName = GITHUB_REPOSITORY+":"+GITHUB_SHA;

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

console.log("Environment variables: ", process.env);

sdk.loginWithApiKey({ apiKey: CDF_CREDENTIALS, project: CDF_PROJECT });

async function uploadSourceCode() {
  const fileName = functionRefName.replace("/","_")+".zip";
  await zip.addLocalFile(FUNCTION_PATH);
  const buffer = zip.toBuffer();
  const fileResponse = await sdk.files.upload(
    {
      externalId: functionRefName,
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
    core.debug(`Successfully deleted function with externalId ${externalId}`);
    console.log(`Successfully deleted function with externalId ${externalId}`);
  } catch (ex) {
    core.debug(`Did not delete function: ${ex.errorMessage}`);
    console.log(`Did not delete function: ${ex.errorMessage}`)
  }
}

async function deployFunction(fileId, functionName, externalId) {
  try {
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
    core.exportVariable('functionId', `${functionId}`);
    core.exportVariable('functionExternalId', `${externalId}`);
    core.exportVariable('functionName', `${functionName}`);
    console.log(`Successfully deployed function ${functionName} with external id ${externalId} and id ${functionId}.`);
  } catch (ex) {
    core.setFailed(ex.message);
    throw ex;
  }
}

async function handlePush() {
  const fileResponse = await uploadSourceCode();

  const functionName = functionRefName;
  const externalId = functionName;
  await deleteFunction(functionName);
  await deployFunction(fileResponse.id, functionName, externalId);
}

async function handlePR() {
  const functionName = GITHUB_REPOSITORY+"/"+GITHUB_HEAD_REF;
  const externalId = functionName;
  core.debug(`Deleting potential old PR function ...`);
  await deleteFunction(functionName);
  if (process.env.DELETE_PR_FUNCTION) {
    return;
  }
  core.debug(`Uploading source code ...`);
  const fileResponse = await uploadSourceCode();
  core.debug(`Redeploying PR function ...`);
  await deployFunction(fileResponse.id, functionName, externalId);
  core.debug(`Done.`);
}

async function run() {
  const user = await sdk.login.status();
  core.debug(`Logged in as user ${user.user}`);

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
