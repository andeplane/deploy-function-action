# Deploy Cognite Function action

This action deploys a python function to Cognite Functions

## Inputs

### `handler_path`

Path to your python function. Defaults to `handler.py`

### `cdf_project`

**Required** The name of the project in CDF

### `cdf_credentials`

**Required** API key that should deploy the function

### `cdf_base_url`

Base url of your CDF project. Defaults to https://api.cognitedata.com

## Outputs

### `functionId`

The ID of the function you created

## Example usage

```yml
uses: cognitedata/deploy-function-action
with:
  cdf_project: cognite
  cdf_credentials: ${{ secrete.COGNITE_CREDENTIALS }}
```

Or see `.github/workflows` for a functioning example
