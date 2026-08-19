import { expect, test } from "vitest";

import { withVaultFixture } from "../support/vault-fixture";

test("Atlas resolves local wiki and Markdown links into one relationship", async () => {
  await withVaultFixture(async () => {
    const vault = await import("@/lib/vault");
    const { buildVaultGraph } = await import("@/lib/vault-graph");

    await vault.createVaultFolder("Course");
    const source = await vault.createMarkdownNote("Source", "Course");
    const target = await vault.createMarkdownNote("Target", "Course");

    await vault.saveMarkdownNote(
      source.path,
      "# Source\n\n[[Target]]\n\n[Target](Target.md)\n\n[[Target|same note]]\n",
    );

    const graph = await buildVaultGraph();

    expect(graph.edges).toEqual([
      { source: source.path, target: target.path },
    ]);
  });
});

test("Atlas ignores external, code, and self links", async () => {
  await withVaultFixture(async () => {
    const vault = await import("@/lib/vault");
    const { buildVaultGraph } = await import("@/lib/vault-graph");

    await vault.createVaultFolder("Course");
    const source = await vault.createMarkdownNote("Source", "Course");
    await vault.createMarkdownNote("Target", "Course");

    await vault.saveMarkdownNote(
      source.path,
      [
        "# Source",
        "",
        "[[Source]]",
        "[Website](https://example.com)",
        "`[[Target]]`",
        "",
        "```md",
        "[Target](Target.md)",
        "```",
      ].join("\n"),
    );

    const graph = await buildVaultGraph();

    expect(graph.edges).toEqual([]);
  });
});

test("Atlas reports note counts for nested folders", async () => {
  await withVaultFixture(async () => {
    const vault = await import("@/lib/vault");
    const { buildVaultGraph } = await import("@/lib/vault-graph");

    await vault.createVaultFolder("Course");
    await vault.createVaultFolder("Week 1", "Course");
    await vault.createMarkdownNote("Overview", "Course");
    await vault.createMarkdownNote("Lesson", "Course/Week 1");

    const graph = await buildVaultGraph();

    expect(graph.folders).toEqual(expect.arrayContaining([
      { path: "Course", name: "Course", count: 2 },
      { path: "Course/Week 1", name: "Week 1", count: 1 },
    ]));
  });
});
