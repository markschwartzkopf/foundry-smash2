import type { CodegenConfig } from '@graphql-codegen/cli';
import keys from '../keys.json' assert { type: 'json' };

const config: CodegenConfig = {
  schema: {
    'https://api.start.gg/gql/alpha': {
      headers: {
        Authorization: `Bearer ${keys.startggKey}`,
      },
    },
  },
  generates: {
    'src/extension/types/startgg-types.ts': {
      plugins: ['typescript'],
    },
  }
};

export default config;
