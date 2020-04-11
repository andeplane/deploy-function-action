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

async function deployFunction(fileId) {
  try {
    const functionResponse = await sdk.post(
      `/api/playground/projects/${CDF_PROJECT}/functions`,
      {
        data: {
          items: [
            {
              name: functionRefName,
              fileId: fileId,
            },
          ],
        },
      }
    );
    const functionId = functionResponse.data.items[0].id;
    core.exportVariable('functionId', `${functionId}`);
    console.log(`Successfully deployed function with id ${functionId}`);
  } catch (ex) {
    core.setFailed(ex.message);
    throw ex;
  }
}

async function run() {
  const user = await sdk.login.status();
  core.debug(`Logged in as user ${user.user}`);
  const fileResponse = await uploadSourceCode();

  await deployFunction(fileResponse.id);
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
