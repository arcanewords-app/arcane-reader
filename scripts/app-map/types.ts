export type Role = 'guest' | 'user' | 'author' | 'admin';

export interface Call {
  clientFn: string;
  method: string;
  path: string;
  callers: string[];
}

export interface Endpoint {
  method: string;
  path: string;
  handler: string;
  handlerFile: string;
  services: string[];
  tags: string[];
}

export interface Screen {
  path: string;
  component: string;
  file: string;
  access: Role;
  areaId: string;
  title: string;
  calls: Call[];
  navigatesTo: string[];
}

export interface AppMap {
  generatedBy: 'npm run docs:app-map';
  product: { name: string; tagline: string };
  areas: { id: string; title: string; blurb: string }[];
  roles: { id: Role; label: string }[];
  spines: Record<Role, string[]>;
  screens: Screen[];
  shell: { calls: Call[]; navigatesTo: string[] };
  endpoints: Endpoint[];
  warnings: string[];
}
