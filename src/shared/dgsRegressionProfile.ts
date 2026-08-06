export const DGS_REGRESSION_TOOL_IDS = [910, 920, 930] as const;

export type ExplicitDgsOwner = {
  uid: string;
  spec: string;
  language?: string;
};

export type RegressionDgsController = {
  uid: string;
  spec: string;
  language?: string;
  explicit: boolean;
};

export function buildImplicitRegressionDgsSpec(boardId: string): string {
  return boardId + ';tools=[' + DGS_REGRESSION_TOOL_IDS.join(';') + ']';
}

export function resolveRegressionDgsController(
  boardId: string,
  implicitUid: string,
  requestLanguage?: string,
  explicitOwner?: ExplicitDgsOwner | null
): RegressionDgsController {
  if (explicitOwner) {
    return {
      uid: explicitOwner.uid,
      spec: explicitOwner.spec,
      language: explicitOwner.language || requestLanguage,
      explicit: true
    };
  }

  return {
    uid: implicitUid,
    spec: buildImplicitRegressionDgsSpec(boardId),
    language: requestLanguage,
    explicit: false
  };
}
