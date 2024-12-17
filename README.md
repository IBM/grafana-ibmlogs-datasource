# IBM Logs Datasource Plugin for Grafana

This datasource provides access to IBM logs in grafana panels. You can
build and install it yourself in your environment. Grafana does not
accept contributions of plugins to their registry that talk to
commercial services, unless you pay for a commercial grafana.com
subscription, which is why this is not in the main grafana registry.

## Getting started

### Frontend

1. Install dependencies

   ```bash
   npm install
   ```

2. Build plugin in development mode and run in watch mode

   ```bash
   npm run dev
   ```

3. Build plugin in production mode

   ```bash
   npm run build
   ```

## Build for install

You can build and install this as a private plugin. To do this you must sign the plugin, privately.

## Distributing your plugin

When distributing a Grafana plugin either within the community or privately the plugin must be signed so the Grafana application can verify its authenticity. This can be done with the `@grafana/sign-plugin` package.

_Note: It's not necessary to sign a plugin during development. The docker development environment that is scaffolded with `@grafana/create-plugin` caters for running the plugin without a signature._

## Initial steps

Before signing a plugin please read the Grafana [plugin publishing and signing criteria](https://grafana.com/docs/grafana/latest/developers/plugins/publishing-and-signing-criteria/) documentation carefully.

`@grafana/create-plugin` has added the necessary commands and workflows to make signing and distributing a plugin via the grafana plugins catalog as straightforward as possible.

Before signing a plugin for the first time please consult the Grafana [plugin signature levels](https://grafana.com/docs/grafana/latest/developers/plugins/sign-a-plugin/#plugin-signature-levels) documentation to understand the differences between the types of signature level.

1. Create a [Grafana Cloud account](https://grafana.com/signup).
2. Make sure that the first part of the plugin ID matches the slug of your Grafana Cloud account.
   - _You can find the plugin ID in the `plugin.json` file inside your plugin directory. For example, if your account slug is `acmecorp`, you need to prefix the plugin ID with `acmecorp-`._
3. Create a Grafana Cloud API key with the `PluginPublisher` role.
4. Keep a record of this API key as it will be required for signing a plugin

## Signing a plugin

With signing key in hand, do the following:

```
rm -rf dist
npm run build
GRAFANA_ACCESS_POLICY_TOKEN=XXXX npx @grafana/sign-plugin@latest --rootUrls URL_OF_YOUR_INSTALLATION
cp -a dist/ sdague-ibmlogs-datasource/

VERSION=$(cat package.json | jq '.version' -r)

zip sdague-ibmlogs-datasource-$VERSION.zip sdague-ibmlogs-datasource -r
```

This is now ready for installation.
