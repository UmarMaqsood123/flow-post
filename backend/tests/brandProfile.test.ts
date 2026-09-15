import { describe, expect, it } from "vitest";
import { BrandProfile } from "../src/models/brandProfile.model";
import { useTestDatabase } from "./helpers/database";
import { addMember, call, createUser, createWorkspace, type TestUser } from "./helpers/workspace";

useTestDatabase();

const profilePath = (workspaceId: string) => `/workspaces/${workspaceId}/brand-profile`;
const stepPath = (workspaceId: string, step: string) =>
  `${profilePath(workspaceId)}/onboarding/steps/${step}`;
const completePath = (workspaceId: string) => `${profilePath(workspaceId)}/onboarding/complete`;

const STEP_DATA = {
  business: {
    businessName: "Acme Coffee",
    website: "https://acme.example",
    industry: "Food & beverage",
    description: "Small-batch coffee roaster.",
  },
  audience: {
    productsServices: ["Coffee beans", "Subscriptions"],
    targetAudience: "Home baristas aged 25-45",
    targetLocations: ["Austin, TX"],
  },
  goals: {
    primaryGoal: "SALES",
    preferredPlatforms: ["INSTAGRAM", "TIKTOK"],
    postingFrequency: "SEVERAL_TIMES_A_WEEK",
  },
  voice: {
    brandVoice: { tones: ["FRIENDLY", "PLAYFUL"], notes: "No jargon." },
    keywords: ["specialty coffee"],
    topics: ["brewing tips"],
  },
  competitors: {
    competitors: [{ name: "Big Bean Co", website: "https://bigbean.example" }],
  },
};

interface ErrorDetail {
  path: string;
  message: string;
  step?: string;
}

const detailPaths = (body: { error: { details?: ErrorDetail[] } }) =>
  (body.error.details ?? []).map((detail) => detail.path);

const setup = async () => {
  const owner = await createUser("Olivia");
  const workspace = await createWorkspace(owner, {
    website: "https://olivia.example",
    industry: "Retail",
  });
  return { owner, workspace };
};

const completeAllSteps = async (user: TestUser, workspaceId: string) => {
  for (const [step, data] of Object.entries(STEP_DATA)) {
    await call(user, "post", stepPath(workspaceId, step), data).expect(200);
  }
};

describe("Brand profile drafts", () => {
  it("returns a not-started profile prefilled from the workspace without saving it", async () => {
    const { owner, workspace } = await setup();

    const res = await call(owner, "get", profilePath(workspace.id)).expect(200);

    expect(res.body.data.brandProfile).toMatchObject({
      id: null,
      businessName: workspace.name,
      website: "https://olivia.example",
      industry: "Retail",
      description: null,
      productsServices: [],
      primaryGoal: null,
      brandVoice: { tones: [], notes: null },
      onboarding: {
        status: "NOT_STARTED",
        currentStep: "business",
        completedSteps: [],
        skippedSteps: [],
        completedAt: null,
      },
    });
    expect(await BrandProfile.countDocuments({ workspace: workspace.id })).toBe(0);
  });

  it("saves drafts without required fields and resumes from the saved step", async () => {
    const { owner, workspace } = await setup();

    const res = await call(owner, "patch", profilePath(workspace.id), {
      targetAudience: "  Busy parents  ",
      keywords: [" coffee ", "Coffee", "beans", ""],
      currentStep: "audience",
    }).expect(200);

    const profile = res.body.data.brandProfile;
    expect(profile).toMatchObject({
      id: expect.any(String),
      targetAudience: "Busy parents",
      keywords: ["coffee", "beans"],
      onboarding: { status: "IN_PROGRESS", currentStep: "audience", startedAt: expect.any(String) },
    });

    const reloaded = await call(owner, "get", profilePath(workspace.id)).expect(200);
    expect(reloaded.body.data.brandProfile).toMatchObject({
      targetAudience: "Busy parents",
      onboarding: { status: "IN_PROGRESS", currentStep: "audience" },
    });
  });

  it("rejects invalid values and ignores fields clients must not set", async () => {
    const { owner, workspace } = await setup();

    const invalid = await call(owner, "patch", profilePath(workspace.id), {
      website: "javascript:alert(1)",
      primaryGoal: "GO_VIRAL",
      preferredPlatforms: ["MYSPACE"],
      keywords: Array.from({ length: 31 }, (_, index) => `keyword ${index}`),
    }).expect(422);
    const paths = detailPaths(invalid.body);
    expect(paths).toEqual(expect.arrayContaining(["website", "primaryGoal", "keywords"]));
    expect(paths.some((path) => path.startsWith("preferredPlatforms"))).toBe(true);
    expect(await BrandProfile.countDocuments({ workspace: workspace.id })).toBe(0);

    const other = await createWorkspace(owner, { name: "Other brand" });
    const res = await call(owner, "patch", profilePath(workspace.id), {
      businessName: "Acme",
      workspace: other.id,
      onboarding: { status: "COMPLETED", completedSteps: ["business"] },
    }).expect(200);

    expect(res.body.data.brandProfile.onboarding).toMatchObject({
      status: "IN_PROGRESS",
      completedSteps: [],
    });
    expect(await BrandProfile.countDocuments({ workspace: workspace.id })).toBe(1);
    expect(await BrandProfile.countDocuments({ workspace: other.id })).toBe(0);
  });
});

describe("Onboarding steps", () => {
  it("requires each step's fields before advancing to the next incomplete step", async () => {
    const { owner, workspace } = await setup();

    const invalid = await call(owner, "post", stepPath(workspace.id, "business"), {
      businessName: "  ",
      description: "",
    }).expect(422);
    expect(invalid.body.error.details).toEqual([
      { path: "businessName", message: "Business name is required", step: "business" },
      { path: "description", message: "Describe your business", step: "business" },
    ]);
    // A failed step saves nothing.
    expect(await BrandProfile.countDocuments({ workspace: workspace.id })).toBe(0);

    const saved = await call(owner, "post", stepPath(workspace.id, "business"), {
      ...STEP_DATA.business,
      primaryGoal: "SALES", // Belongs to another step, so it is ignored.
    }).expect(200);

    expect(saved.body.data.brandProfile).toMatchObject({
      businessName: "Acme Coffee",
      primaryGoal: null,
      onboarding: { status: "IN_PROGRESS", completedSteps: ["business"], currentStep: "audience" },
    });
  });

  it("only lets steps without required fields be skipped", async () => {
    const { owner, workspace } = await setup();

    await call(owner, "post", stepPath(workspace.id, "goals"), { skipped: true }).expect(400);
    await call(owner, "post", stepPath(workspace.id, "branding"), {}).expect(422);

    const skipped = await call(owner, "post", stepPath(workspace.id, "competitors"), {
      skipped: true,
    }).expect(200);
    expect(skipped.body.data.brandProfile.onboarding).toMatchObject({
      skippedSteps: ["competitors"],
      completedSteps: [],
      currentStep: "business",
    });

    // Filling in a skipped step later moves it from skipped to completed.
    const filled = await call(
      owner,
      "post",
      stepPath(workspace.id, "competitors"),
      STEP_DATA.competitors,
    ).expect(200);
    expect(filled.body.data.brandProfile.onboarding).toMatchObject({
      skippedSteps: [],
      completedSteps: ["competitors"],
    });
  });

  it("completes onboarding once every required field is filled in", async () => {
    const { owner, workspace } = await setup();

    const early = await call(owner, "post", completePath(workspace.id)).expect(422);
    expect(early.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "description", step: "business" }),
        expect.objectContaining({ path: "productsServices", step: "audience" }),
        expect.objectContaining({ path: "brandVoice.tones", step: "voice" }),
      ]),
    );

    await completeAllSteps(owner, workspace.id);
    const beforeCompletion = await call(owner, "get", profilePath(workspace.id)).expect(200);
    expect(beforeCompletion.body.data.brandProfile.onboarding).toMatchObject({
      status: "IN_PROGRESS",
      currentStep: "review",
      completedSteps: ["business", "audience", "goals", "voice", "competitors"],
    });

    const done = await call(owner, "post", completePath(workspace.id)).expect(200);
    expect(done.body.data.brandProfile).toMatchObject({
      primaryGoal: "SALES",
      preferredPlatforms: ["INSTAGRAM", "TIKTOK"],
      brandVoice: { tones: ["FRIENDLY", "PLAYFUL"], notes: "No jargon." },
      competitors: [{ name: "Big Bean Co", website: "https://bigbean.example" }],
      onboarding: { status: "COMPLETED", currentStep: "review", completedAt: expect.any(String) },
    });

    // Completing again is a no-op.
    await call(owner, "post", completePath(workspace.id)).expect(200);

    // Completed profiles stay editable, but required fields can't be cleared.
    const cleared = await call(owner, "patch", profilePath(workspace.id), {
      description: "",
    }).expect(422);
    expect(detailPaths(cleared.body)).toEqual(["description"]);

    const edited = await call(owner, "patch", profilePath(workspace.id), {
      description: "Roaster and café.",
    }).expect(200);
    expect(edited.body.data.brandProfile).toMatchObject({
      description: "Roaster and café.",
      onboarding: { status: "COMPLETED" },
    });
  });
});

describe("Brand profile permissions", () => {
  it("lets every member view it but only admins and owners edit it", async () => {
    const { owner, workspace } = await setup();
    const admin = await createUser("Adam");
    const editor = await createUser("Eve");
    const viewer = await createUser("Vic");
    await addMember(owner, workspace.id, admin, "ADMIN");
    await addMember(owner, workspace.id, editor, "EDITOR");
    await addMember(owner, workspace.id, viewer, "VIEWER");

    for (const member of [admin, editor, viewer]) {
      await call(member, "get", profilePath(workspace.id)).expect(200);
    }

    await call(editor, "patch", profilePath(workspace.id), { businessName: "Nope" }).expect(403);
    await call(viewer, "post", stepPath(workspace.id, "business"), STEP_DATA.business).expect(403);
    await call(editor, "post", completePath(workspace.id)).expect(403);
    expect(await BrandProfile.countDocuments({ workspace: workspace.id })).toBe(0);

    await call(admin, "patch", profilePath(workspace.id), { businessName: "Admin edit" }).expect(
      200,
    );
  });

  it("keeps brand profiles isolated between workspaces", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const aliceWorkspace = await createWorkspace(alice);
    const bobWorkspace = await createWorkspace(bob);

    await call(alice, "patch", profilePath(aliceWorkspace.id), {
      businessName: "Alice Secret Co",
    }).expect(200);

    await call(bob, "get", profilePath(aliceWorkspace.id)).expect(404);
    await call(bob, "patch", profilePath(aliceWorkspace.id), { businessName: "Hijacked" }).expect(
      404,
    );
    await call(bob, "post", stepPath(aliceWorkspace.id, "business"), STEP_DATA.business).expect(
      404,
    );
    await call(bob, "post", completePath(aliceWorkspace.id)).expect(404);

    const bobs = await call(bob, "get", profilePath(bobWorkspace.id)).expect(200);
    expect(bobs.body.data.brandProfile.businessName).toBe(bobWorkspace.name);

    const alices = await BrandProfile.findOne({ workspace: aliceWorkspace.id });
    expect(alices?.businessName).toBe("Alice Secret Co");
  });

  it("is deleted when its workspace is permanently deleted", async () => {
    const { owner, workspace } = await setup();
    await call(owner, "patch", profilePath(workspace.id), { businessName: "Acme" }).expect(200);

    await call(owner, "delete", `/workspaces/${workspace.id}`).expect(200);
    await call(owner, "delete", `/workspaces/${workspace.id}/permanent`, {
      confirmName: workspace.name,
    }).expect(200);

    expect(await BrandProfile.countDocuments({ workspace: workspace.id })).toBe(0);
  });
});
