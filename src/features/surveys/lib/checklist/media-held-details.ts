import type { MediaItem, MediaList } from "../../types";

// What only a viewer with `canHold` (ADMIN) sees of a held photo (survey-media spec 6.2 Grid, A-23): its image,
// caption, actor and reason. Once an answer says `canHold` is gone (a list without it, even one the ordering rule
// refuses, or a 403 on Hold or Release), the page keeps none of it in memory until the next list says otherwise
// (SM-FE-07, SV-071).

function withoutDetails(item: MediaItem): MediaItem {
  if (!item.held) return item;
  return {
    ...item,
    caption: null,
    captionHidden: true,
    held: { at: item.held.at, byName: null, byUserId: null, reason: null },
    contentAvailable: false,
    unavailableReason: "HELD",
  };
}

/**
 * The list as a viewer without `canHold` would get it for its held photos. It is no longer what the server sent, so it
 * claims no `knownVersion` (no `viewDigest`): the next read gets the whole list, never a 204 that would keep it.
 */
export function withoutHeldDetails(list: MediaList): MediaList {
  const basis = list.basis === undefined ? undefined : { ...list.basis };
  if (basis !== undefined) delete basis.viewDigest;
  return {
    ...list,
    ...(basis === undefined ? {} : { basis }),
    canHold: false,
    items: list.items?.map(withoutDetails),
    notAcceptedItems: list.notAcceptedItems?.map(withoutDetails),
    removedItems: list.removedItems?.map(withoutDetails),
  };
}

/** The ids of the held photos of a list (their object URLs go with the details). */
export function heldMediaIds(list: MediaList): string[] {
  return [...(list.items ?? []), ...(list.notAcceptedItems ?? []), ...(list.removedItems ?? [])]
    .filter((item) => item.held && item.id)
    .map((item) => item.id as string);
}

/** True when `incoming` says `canHold` is gone while the list on screen still has it. */
export function heldDetailsLost(shown: MediaList | null, incoming: MediaList): boolean {
  return shown?.canHold === true && incoming.canHold !== true;
}
