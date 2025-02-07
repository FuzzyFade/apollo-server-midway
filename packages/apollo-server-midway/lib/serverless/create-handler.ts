import {
  ApolloServerPluginLandingPageGraphQLPlayground,
  ApolloServerPluginLandingPageDisabled,
} from 'apollo-server-core';
import { buildSchemaSync, NonEmptyArray } from 'type-graphql';
import ApolloResolveTimePlugin from 'apollo-resolve-time';
import ApolloQueryComplexityPlugin from 'apollo-query-complexity';
import merge from 'lodash/merge';

import { ApolloServerMidway } from './apollo-server-midway';
import { InternalResolver } from './internal-resolver';

import { contextExtensionPlugin } from '../plugins/container-extension';
import { printSchemaExtensionPlugin } from '../plugins/print-graphql-schema';

import { CreateApolloHandlerOption } from '../shared/types';
import { presetOption } from '../shared/preset-option';
import { playgroundDefaultSettings } from '../shared/constants';
import { getFallbackResolverPath } from '../shared/utils';

export async function createApolloServerHandler(
  option: CreateApolloHandlerOption
) {
  const {
    context,
    app,
    path,
    appendFaaSContext,
    prodPlaygound,

    disableHealthCheck,
    disableHealthResolver,
    onHealthCheck,

    builtInPlugins: {
      resolveTime,
      queryComplexity,
      contextExtension,
      printSchema,
    },
    apollo: {
      context: userGraphQLContext,
      dataSources,
      mocks,
      mockEntireSchema,
      introspection,
      schema: externalSchemaForApolloServer,
      plugins,
      persistedQueries,
    },
    schema: {
      globalMiddlewares,
      dateScalarMode,
      nullableByDefault,
      skipCheck,
      authMode,
      authChecker,
    },
  } = merge(presetOption, option);

  const resolverPath =
    option?.schema?.resolvers ?? getFallbackResolverPath(app);

  const schema =
    externalSchemaForApolloServer ??
    buildSchemaSync({
      resolvers: [
        ...resolverPath,
        !disableHealthResolver && InternalResolver,
      ].filter(Boolean) as NonEmptyArray<string>,
      dateScalarMode,
      nullableByDefault,
      skipCheck,
      globalMiddlewares,
      authMode,
      authChecker,
      // not supported! will cause unexpected error.
      // container: app?.getApplicationContext() ?? undefined,
    });

  const server = new ApolloServerMidway({
    schema,
    dataSources,
    mocks,
    mockEntireSchema,
    persistedQueries,
    introspection,
    context: appendFaaSContext
      ? {
          ...userGraphQLContext,
          faasContext: context,
          container: app.getApplicationContext(),
        }
      : userGraphQLContext,
    plugins: [
      (prodPlaygound || process.env.NODE_ENV !== 'production')
        ? ApolloServerPluginLandingPageGraphQLPlayground({
            settings: playgroundDefaultSettings,
          })
        : ApolloServerPluginLandingPageDisabled(),
      resolveTime.enable && ApolloResolveTimePlugin(),
      queryComplexity.enable &&
        ApolloQueryComplexityPlugin(
          schema,
          queryComplexity.maxComlexity,
          queryComplexity.throwOnMaximum
        ),
      contextExtension.enable &&
        contextExtensionPlugin(option.context, option.app),
      printSchema.enable && printSchemaExtensionPlugin(schema, printSchema),
      ...plugins,
    ].filter(Boolean),
  });

  await server.start();
  return server.createHandler({
    path,
    context,
    disableHealthCheck,
    onHealthCheck,
  });
}
