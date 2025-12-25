# Agent Instructions

## Verification

Before marking a task as complete, you **MUST** verify your changes by running the following command:

```bash
npm run code:check
```

This command runs:

1.  **Type Check**: `tsc --noEmit`
2.  **Format Check**: `prettier --check`
3.  **Lint Check**: `eslint`
4.  **Tests**: `vitest`

If this command fails, you **MUST** fix the errors before finishing.

## Formatting and Linting

If you need to fix formatting or linting issues, you can run:

```bash
npm run code:fix
```

This will automatically format files and fix fixable lint errors.
