/**
 * POST /api/generate-scaffolding
 *
 * Generates documentation scaffolding from GoalSpec + service path.
 * Zero LLM calls — pure templating from structured data.
 *
 * Input:  { goalSpec: GoalSpec, steps: WorkflowStep[] }
 * Output: { prd, stack, architecture, features[], claudeMd, agentsMd }
 */

import { NextResponse } from 'next/server';
import type { GoalSpec, WorkflowStep } from '@/types/ecosystem';
import {
  buildPRD,
  buildStack,
  buildArchitecture,
  buildFeatureSpecs,
  buildClaudeMD,
  buildAgentsMD,
} from '@/lib/scaffolding-templates';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    goalSpec?: GoalSpec;
    steps?: WorkflowStep[];
  };

  if (!body.goalSpec || !body.steps?.length) {
    return NextResponse.json(
      { error: 'goalSpec and non-empty steps array are required' },
      { status: 400 },
    );
  }

  const { goalSpec, steps } = body;

  const prd = buildPRD(goalSpec);
  const stack = buildStack(goalSpec, steps);
  const architecture = buildArchitecture(steps);
  const features = buildFeatureSpecs(steps);
  const claudeMd = buildClaudeMD(goalSpec, steps);
  const agentsMd = buildAgentsMD(goalSpec, steps);

  return NextResponse.json({
    prd,
    stack,
    architecture,
    features,
    claudeMd,
    agentsMd,
  });
}
