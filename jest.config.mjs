// jest.config.mjs
export default {
  testEnvironment: 'jsdom',
  
  // Transform ES modules from these packages
  transformIgnorePatterns: [
    'node_modules/(?!(@reduxjs/toolkit|@nostr-dev-kit|nostr-tools|@noble|@fedimint|redux|immer|reselect|redux-thunk)/)',
  ],
  
  moduleNameMapper: {
    // Assets
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/__mocks__/fileMock.js',
    '\\.(css|less|scss)$': 'identity-obj-proxy',
  },
  
  // Use Babel for all transformations
  transform: {
    '^.+\\.(ts|tsx|js|jsx|mjs)$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          ['@babel/preset-react', { runtime: 'automatic' }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
  
  testMatch: ['<rootDir>/src/tests/**/*.test.{ts,tsx}'],
  moduleDirectories: ['node_modules', 'src'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json', 'node'],
  
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
};