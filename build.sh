#!/bin/bash

if [[ -e "env.sh" ]]; then
    source env.sh
fi

if [[ -z "$GRAFANA_ACCESS_POLICY_TOKEN" ]]; then
    echo "Missing \$GRAFANA_ACCESS_POLICY_TOKEN, please export token"
    exit 1
fi

if [[ -z "$ROOT_URL" ]]; then
    echo "Missing \$ROOT_URL, please export what url to sign for"
    exit 1
fi

set -xe

rm -rf dist sdague-ibmlogs-datasource

npm run build
npx @grafana/sign-plugin@latest --rootUrls $ROOT_URL
cp -a dist/ sdague-ibmlogs-datasource/

VERSION=$(cat package.json | jq '.version' -r)

zip sdague-ibmlogs-datasource-$VERSION.zip sdague-ibmlogs-datasource -r
sha1sum sdague-ibmlogs-datasource-$VERSION.zip > sdague-ibmlogs-datasource-$VERSION.zip.sha1
