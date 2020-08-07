# Deploy Cognite Function action

This action deploys a Python function to Cognite Functions.

## Inputs

### `cdf_project`

The name of the project in CDF.

### `cdf_credentials`

API key that should deploy the function.

### `cdf_base_url`

Base url of your CDF project. Defaults to https://api.cognitedata.com.

### `folder`

Path to a directory containing your function. By using `strategy.matrix.cfg.folder` in your workflow, multiple functions can be used. 

### `function_path`

Path to python file containing your function. By using `strategy.matrix.cfg.function_path` in your workflow, multiple functions can be used.

## Outputs

### `functionId`

The ID of the function you created.

## Example usage

```yml
uses: andeplane/deploy-function-action
with:
  cdf_project: cognite
  cdf_credentials: ${{ secrets.COGNITE_CREDENTIALS }}
  folder: ${{ matrix.cfg.folder }}
  function_path: ${{ matrix.cfg.function_path }}
```

Or see `.github/workflows` for a functioning example
