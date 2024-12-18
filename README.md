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

### Distributing your plugin

When distributing a Grafana plugin either within the community or privately the plugin must be signed so the Grafana application can verify its authenticity. This can be done with the `@grafana/sign-plugin` package.

_Note: It's not necessary to sign a plugin during development. The docker development environment that is scaffolded with `@grafana/create-plugin` caters for running the plugin without a signature._

### Initial steps

Before signing a plugin please read the Grafana [plugin publishing and signing criteria](https://grafana.com/docs/grafana/latest/developers/plugins/publishing-and-signing-criteria/) documentation carefully.

`@grafana/create-plugin` has added the necessary commands and workflows to make signing and distributing a plugin via the grafana plugins catalog as straightforward as possible.

Before signing a plugin for the first time please consult the Grafana [plugin signature levels](https://grafana.com/docs/grafana/latest/developers/plugins/sign-a-plugin/#plugin-signature-levels) documentation to understand the differences between the types of signature level.

1. Create a [Grafana Cloud account](https://grafana.com/signup).
2. Make sure that the first part of the plugin ID matches the slug of your Grafana Cloud account.
   - _You can find the plugin ID in the `plugin.json` file inside your plugin directory. For example, if your account slug is `acmecorp`, you need to prefix the plugin ID with `acmecorp-`._
3. Create a Grafana Cloud API key with the `PluginPublisher` role.
4. Keep a record of this API key as it will be required for signing a plugin

### Signing a plugin

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


## Development

In order to develop this plugin you'll want to setup the environment
so that you can rapidly turn around and expose changes.

### Setup datasource.yaml

```bash
cp provisioning/datasource.yaml.tmpl provisioning/datasource.yaml
```

Update the endpoint and apiKey in that file. This means every time
docker brings up the local test environment it will provision your
plugin, so you don't need to do that step manually.

### Build and start local instance

```bash
./build.sh
docker compose up --build
```

This will start a local docker environment with the plugin
installed. It is accessable at http://127.0.0.1:3000.

### Login

Login to the environment. The local test credentials are admin/admin.

You can then provision a new databoard with the datasource, and see if
it works correctly.


### Shutdown for changes

Because this is a data source plugin, it is only instantiated on
boot. You must shutdown docker compose between changes for new changes
to take effect.

```bash
docker compose down
```

## Useful Documentation

The following documentation is useful in expanding the plugin.

- [Query API for IBM Cloud Logs](https://cloud.ibm.com/apidocs/logs-service-api#query)
- [EventSource
  Parser](https://www.npmjs.com/package/eventsource-parser) - the
  Response from the Query API is undocumented SSE stream. That
  requires fetching the raw data stream, then running it through
  eventsource-parser to get meaningful data.
- [Connecting to OAuth2 sources in Grafana](https://grafana.com/developers/plugin-tools/how-to-guides/data-source-plugins/add-authentication-for-data-source-plugins#add-an-oauth-20-proxy-route-to-your-plugin) - how to securely do this in grafana so you don't need to write your own OAuth stack. Grafana then does token validation and caching.
- [Building a Logs Data Plugin](https://grafana.com/developers/plugin-tools/tutorials/build-a-logs-data-source-plugin) - there are some best practices here this isn't yet doing, worth converting at some point
