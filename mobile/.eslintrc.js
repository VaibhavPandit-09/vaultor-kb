module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['scripts/*.mjs', 'editor/*.js'],
      parser: 'espree',
      parserOptions: {ecmaVersion: 2022, sourceType: 'module'},
      env: {node: true, browser: true},
    },
  ],
};
