# FUCK YEA Smart Contract Framework

An EOS (and Antelope) smart contract framework so easy it'll make you say "Fuck Yea".

## Installation

```
npm i -g fuckyea
```

### Using npx

You can also use `npx` for any of these commands so that you don't need to manually install first. 

For instance:

```
npx fuckyea create ...
```

## Create a new project

```
fuckyea create <project_name> [optional_directory] 
```

## Scaffold a contract, test file, or deployment

```
fuckyea scaffold <type(contract|test|deployment)> <name|network> [optional_directory]
```

## Build

```
fuckyea build
```

## Test

```
fuckyea test [--build]
```

## Deploy

```
fuckyea deploy <network> [--build]
```

## Want to use a starter kit?

Head over to [the EOS Template Projects Repo](https://github.com/eosnetworkfoundation/template-projects) and see how you can use
fuckyea to generate starterkit templates.

## Configs

When you create a project you get a `fuckyea.config.js` file and a `.env` file. 
Inside your `.env` you will put any private keys you need. 

The `fuckyea.config.js` file defines the information needed for deployments.
In the `networks` key, you can define any key you want that matches a file in the `deployments` directory. 



## Need help?

```
fuckyea --help
```

Or come to the antelop devs chat: https://t.me/antelopedevs
