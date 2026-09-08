import { getBoardObjects } from './boardObjects';

type UpdateKind = 'compass' | 'trace' | 'coordinates' | 'slider';
type Targets = Record<UpdateKind, Set<any>>;

// Board ownership keeps macro objects live when their DGS menu is replaced.
// Constructors and property/restore setters register subsequent changes explicitly.
const boards = new WeakMap<object, Targets>();
const predicates: Record<UpdateKind, (object: any) => boolean> = {
  compass: object => !!object.__liaDgsCompassArc && !object.__liaDgsCompassDraft &&
    object.__liaDgsCompassFixedRadius === true,
  trace: object => !!object.__liaDgsTraceEnabled,
  coordinates: object => !!object.__liaDgsCoordinateExpressions,
  slider: object => !!object.__liaDgsSlider && !object.__liaDgsSliderDeleted
};

function track(targets: Targets, object: any): void {
  if (!object) return;
  (Object.keys(predicates) as UpdateKind[]).forEach(kind => {
    if (predicates[kind](object)) targets[kind].add(object);
    else targets[kind].delete(object);
  });
}

function targetsFor(board: any): Targets {
  let targets = boards.get(board);
  if (!targets) {
    targets = { compass: new Set(), trace: new Set(), coordinates: new Set(), slider: new Set() };
    boards.set(board, targets);
    getBoardObjects(board).forEach(object => track(targets!, object));
  }
  return targets;
}

export function trackDgsUpdateObject(board: any, object: any): void {
  if (board && object) track(targetsFor(board), object);
}

/** Visit active features only; prune indirect deletion and object-id reuse too. */
export function getDgsUpdateTargets(board: any, kind: UpdateKind): any[] {
  if (!board) return [];
  const targets = targetsFor(board)[kind];
  const live: any[] = [];
  targets.forEach(object => {
    const registered = board.objects
      ? board.objects[object.id] === object
      : Array.isArray(board.objectsList) && board.objectsList.includes(object);
    if (registered && predicates[kind](object)) live.push(object);
    else targets.delete(object);
  });
  return live;
}
