# TypeScript Best Practices

TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.

## Strict Mode

Always enable `strict: true` in your `tsconfig.json`. This ensures type safety and prevents common runtime bugs like null pointer exceptions.

## Type Inference

Let TypeScript infer types whenever obvious. Only write explicit type annotations when necessary for public APIs or ambiguous return types.

## Async Await Patterns

Always handle errors with try/catch when working with asynchronous operations and Promises. Avoid raw promise chaining when async/await provides better readability.

## Type Guards

Use custom type guards with the `is` keyword to narrow down variable types safely at runtime.
