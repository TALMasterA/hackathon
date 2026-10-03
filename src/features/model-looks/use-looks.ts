"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mesh, Texture, type Material, type Object3D } from "three";
import { lookKey, looksReducer, scopedLooks, type Looks, type LooksAction } from "./looks";

function disposeObject(object: Object3D) {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry.dispose();
    for (const material of (Array.isArray(child.material) ? child.material : [child.material]) as Material[]) {
      for (const value of Object.values(material)) if (value instanceof Texture) value.dispose();
      material.dispose();
    }
  });
}

/** Session-only map of item ID to 3D look; never part of the editor reducer, undo history or storage. */
export function useLooks(scope: string = "demo") {
  const [looks, setLooks] = useState<Looks>(() => new Map());
  const latest = useRef(looks);
  useEffect(() => {
    latest.current = looks;
  }, [looks]);
  const update = useCallback((action: LooksAction, targetScope: string) => {
    const key = lookKey(targetScope, action.itemId);
    const previous = action.type === "turn" ? undefined : latest.current.get(key);
    const next = looksReducer(latest.current, { ...action, itemId: key });
    latest.current = next;
    setLooks(next);
    // A replaced or removed look's GPU resources are freed once the scene no longer draws it.
    if (previous && next.get(key)?.object !== previous.object) setTimeout(() => disposeObject(previous.object), 1000);
  }, []);
  return { looks: scopedLooks(looks, scope), update: (action: LooksAction, targetScope = scope) => update(action, targetScope) };
}
