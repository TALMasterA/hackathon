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
    const before = latest.current;
    const next = looksReducer(before, action.type === "clear" ? action : { ...action, itemId: lookKey(targetScope, action.itemId) });
    latest.current = next;
    setLooks(next);
    // A replaced, removed or cleared look's GPU resources are freed once the scene no longer draws it.
    const retained = new Set([...next.values()].map((look) => look.object));
    for (const look of before.values()) if (!retained.has(look.object)) setTimeout(() => disposeObject(look.object), 1000);
  }, []);
  return { looks: scopedLooks(looks, scope), update: (action: LooksAction, targetScope = scope) => update(action, targetScope) };
}
