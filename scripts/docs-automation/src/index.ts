#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Main packages that have widget/hook documentation.
 */
const MAIN_DOC_PACKAGES = [
  'instantsearch.js',
  'react-instantsearch',
  'vue-instantsearch',
];

/**
 * Maps package names to their documentation flavor suffix.
 */
const PACKAGE_TO_FLAVOR: Record<string, string> = {
  'instantsearch.js': 'js',
  'react-instantsearch': 'react',
  'vue-instantsearch': 'vue',
};

interface LatestRelease {
  packageName: string;
  version: string;
  content: string;
}

/**
 * Extracts the latest release section from a changelog file.
 * Simply grabs everything between the first ## [version] and the next ## [version].
 */
function extractLatestRelease(changelogPath: string, packageName: string): LatestRelease | null {
  const content = fs.readFileSync(changelogPath, 'utf-8');

  // Match version headers: ## [4.87.0] or ## 4.87.0
  const versionHeaderRegex = /^## \[?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)\]?/gm;

  const matches = [...content.matchAll(versionHeaderRegex)];
  if (matches.length === 0) return null;

  const firstMatch = matches[0];
  const version = firstMatch[1];
  const startIndex = firstMatch.index!;

  // Find the end (next version header or end of file)
  const endIndex = matches.length > 1 ? matches[1].index! : content.length;

  // Extract the section
  const section = content.slice(startIndex, endIndex).trim();

  // Skip if section is too short (likely just a version bump with no changes)
  if (section.length < 50) return null;

  return {
    packageName,
    version,
    content: section,
  };
}

/**
 * Gets the root directory of the InstantSearch repo.
 */
function getRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, 'packages', 'instantsearch.js'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Generates a simple prompt with raw changelog content.
 * Let Claude do the interpretation.
 */
function generatePrompt(releases: LatestRelease[]): string {
  const packageList = releases.map((r) => `- ${r.packageName} v${r.version}`).join('\n');
  const flavors = releases.map((r) => PACKAGE_TO_FLAVOR[r.packageName]).filter(Boolean);
  const uniqueFlavors = [...new Set(flavors)];

  let prompt = `You are updating documentation for InstantSearch releases:
${packageList}

## Overview

InstantSearch has multiple flavors, each with its own documentation file suffix:
- \`instantsearch.js\` (vanilla JS) → \`.js.mdx\` files
- \`react-instantsearch\` (React) → \`.react.mdx\` files
- \`vue-instantsearch\` (Vue) → \`.vue.mdx\` files

**Flavors in this release:** ${uniqueFlavors.map(f => `.${f}.mdx`).join(', ')}

## Task

1. **Explore first**: Use \`Glob\` to find documentation files - look for patterns like \`**/instantsearch/**\`, \`**/widgets/**\`, or \`**/api-reference/**\`
2. **Read existing docs**: Look at a few existing widget/hook docs to understand the format
3. **Read the changelogs below**: Understand what changed in this release
4. **Update documentation**: Create or update docs for new features, modified components, breaking changes

## Changelog Entries

Below are the raw changelog entries for each package. Read them to understand what needs documentation.

`;

  for (const release of releases) {
    prompt += `### ${release.packageName} v${release.version}

\`\`\`markdown
${release.content}
\`\`\`

`;
  }

  prompt += `## Instructions

- For new widgets/hooks, create new \`.{flavor}.mdx\` files following existing patterns
- For modified components, update existing docs with new props/options
- For breaking changes, update migration guides if applicable
- Match the existing documentation format and style exactly
- Only modify documentation files
- Don't add placeholder content - only document what actually exists

## Source Code Reference

The InstantSearch source code is available at \`../instantsearch\` for reference.
You can read files to understand the API, types, and implementation details.
For example: \`../instantsearch/packages/instantsearch.js/src/widgets/\`
`;

  return prompt;
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const verbose = args.includes('--verbose');

  // Parse --output argument
  let outputPath: string | undefined;
  const outputIndex = args.indexOf('--output');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    outputPath = args[outputIndex + 1];
  }

  const repoRoot = getRepoRoot();
  const packagesDir = path.join(repoRoot, 'packages');

  if (verbose) {
    console.log('Repo root:', repoRoot);
    console.log('Packages dir:', packagesDir);
  }

  if (command === 'generate-prompt') {
    // Extract latest releases from main packages
    const releases: LatestRelease[] = [];

    for (const packageName of MAIN_DOC_PACKAGES) {
      const changelogPath = path.join(packagesDir, packageName, 'CHANGELOG.md');

      if (!fs.existsSync(changelogPath)) {
        if (verbose) console.log(`  Skipping ${packageName} (no CHANGELOG.md)`);
        continue;
      }

      const release = extractLatestRelease(changelogPath, packageName);

      if (release) {
        releases.push(release);
        if (verbose) console.log(`  Found: ${packageName}@${release.version}`);
      } else {
        if (verbose) console.log(`  Skipping ${packageName} (no significant changes)`);
      }
    }

    if (releases.length === 0) {
      console.log('No packages with documentation needs detected');
      process.exit(0);
    }

    console.log(`Found ${releases.length} package(s) with changes:`);
    for (const r of releases) {
      console.log(`  - ${r.packageName}@${r.version}`);
    }

    const prompt = generatePrompt(releases);

    // Also output package info as JSON for the workflow
    const packagesInfo = releases.map((r) => ({
      name: r.packageName,
      version: r.version,
    }));

    if (outputPath) {
      const resolvedPath = outputPath.endsWith('.txt')
        ? outputPath
        : path.join(outputPath, 'prompt.txt');
      const outputDirPath = path.dirname(resolvedPath);

      if (!fs.existsSync(outputDirPath)) {
        fs.mkdirSync(outputDirPath, { recursive: true });
      }

      fs.writeFileSync(resolvedPath, prompt);
      console.log(`Prompt written to: ${resolvedPath}`);

      // Also write packages info JSON
      const jsonPath = resolvedPath.replace('.txt', '-packages.json');
      fs.writeFileSync(jsonPath, JSON.stringify(packagesInfo, null, 2));
      console.log(`Packages info written to: ${jsonPath}`);
    } else {
      console.log('\n' + prompt);
    }
  } else {
    console.log(`
InstantSearch Documentation Automation

Usage: npx tsx src/index.ts <command> [options]

Commands:
  generate-prompt      Generate a prompt for Claude Code CLI

Options:
  --verbose            Show detailed output
  --output <path>      Output file path for the prompt

Examples:
  # Generate prompt and print to stdout
  npx tsx src/index.ts generate-prompt

  # Generate prompt and save to file
  npx tsx src/index.ts generate-prompt --output ./prompt.txt
`);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
