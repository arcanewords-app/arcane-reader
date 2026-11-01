// Copyright (C) 2026 Ilya Murashka
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ComponentChildren, ComponentType } from 'preact';

type PageComponent = (props: never) => ComponentChildren;

type PageProps<C> = C extends (props: infer P) => ComponentChildren
  ? unknown extends P
    ? { path?: string }
    : P extends object
      ? P
      : { path?: string }
  : { path?: string };

/**
 * Props for a route gate. `C` is the page component.
 * Route params stay optional: preact-router fills them in at runtime.
 */
export type RoutedGateProps<C extends PageComponent> = {
  path: string;
  component: C;
} & Partial<Omit<PageProps<C>, 'path'>>;

/**
 * Render a routed page. The assertions are the boundary where the router
 * supplies params that are not written in the gate's JSX.
 */
export function renderRoutedPage<C extends PageComponent>(
  Component: C,
  props: object
): ComponentChildren {
  const Page = Component as unknown as ComponentType<PageProps<C>>;
  return <Page {...(props as PageProps<C>)} />;
}
