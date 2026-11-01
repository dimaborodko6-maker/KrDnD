const globals = require('globals');

module.exports = [
    {
        files: ['**/*.js', '**/*.cjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.es2021
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'error'
        }
    },
    {
        files: ['public/**/*.js'],
        languageOptions: {
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...globals.es2021,
                _tr: 'readonly'
            }
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
        }
    }
];
