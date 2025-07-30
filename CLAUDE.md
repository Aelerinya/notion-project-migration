# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CLI tool for migrating pages between Notion databases using React/Ink for the terminal interface. The project is currently in early development with basic CLI scaffolding in place.

## Development Commands

- `npm run build` - Compile TypeScript to dist/
- `npm run dev` - Watch mode compilation with TypeScript
- `npm test` - Run full test suite (Prettier formatting, XO linting, and AVA tests)
- `npm run test:watch` - Use `npm test -- --watch` for test watching

## Architecture

The project uses a React-based terminal UI architecture:

- **Entry Point**: `source/cli.tsx` - Sets up CLI argument parsing with meow and renders the React app
- **Main App**: `source/app.tsx` - Main React component using Ink for terminal rendering  
- **Build Output**: TypeScript compiles from `source/` to `dist/` directory
- **CLI Binary**: Distributed as `dist/cli.js` (defined in package.json bin field)

## Tech Stack

- **UI Framework**: Ink (React for terminal interfaces)
- **CLI Parsing**: meow
- **Language**: TypeScript with ES modules
- **Testing**: AVA test runner with ink-testing-library
- **Linting**: XO with React rules and Prettier integration
- **Notion Integration**: @notionhq/client (planned, not yet implemented)

## Code Style

- XO ESLint configuration with React extensions
- Prettier formatting using @vdemedes/prettier-config
- React prop-types disabled (using TypeScript)
- ES module format throughout

## Testing

- AVA configured for TypeScript/TSX with ts-node/esm loader
- Tests use ink-testing-library for React component testing
- Test files can be `.ts` or `.tsx` extensions

## Key Implementation Notes

- The current code is template/scaffold code - the actual Notion migration logic is not yet implemented
- Subcommand `test-connection` mentioned in SPEC.md is planned but not implemented
- CLI currently only accepts a `--name` flag as a placeholder