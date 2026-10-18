const app = document.getElementById('app');
const state = { role: 'guest', view: 'pitch', selected: null };

const rank = { guest: 0, user: 1, author: 2, admin: 3 };

function visibleScreens() {
  const max = rank[state.role] ?? 0;
  return DATA.screens.filter((screen) => (rank[screen.access] ?? 0) <= max);
}

function screenByPath(path) {
  return DATA.screens.find((screen) => screen.path === path) || null;
}

function endpointFor(call) {
  return (
    DATA.endpoints.find((endpoint) =>
      sameShape(call.method, call.path, endpoint.method, endpoint.path)
    ) || null
  );
}

function sameShape(methodA, pathA, methodB, pathB) {
  if (methodA !== methodB) return false;
  const left = pathA.split('/').filter(Boolean);
  const right = pathB.split('/').filter(Boolean);
  if (left.length !== right.length) return false;
  return left.every((part, index) => {
    const other = right[index];
    const a = part.startsWith(':');
    const b = other.startsWith(':');
    if (a || b) return a && b;
    return part === other;
  });
}

function render() {
  app.replaceChildren();
  const page = div('page');
  page.append(topbar());
  page.append(state.view === 'pitch' ? pitch() : board());
  app.append(page);
  if (state.selected) app.append(panel(state.selected));
}

function topbar() {
  const bar = div('top');
  const brand = div('brand');
  brand.textContent = 'Arcane Reader';
  const views = div('views');
  views.append(viewButton('pitch', 'Презентация'), viewButton('board', 'Как устроено'));
  bar.append(brand, views);
  return bar;
}

function viewButton(id, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (state.view === id) button.className = 'is-on';
  button.addEventListener('click', () => {
    state.view = id;
    render();
  });
  return button;
}

function pitch() {
  const wrap = document.createElement('section');
  const title = document.createElement('h1');
  title.textContent = DATA.product.name;
  const tagline = document.createElement('p');
  tagline.className = 'tagline';
  tagline.textContent = DATA.product.tagline;
  wrap.append(title, tagline, roleSwitch(), stats(), spine(), areaGrid());
  return wrap;
}

function roleSwitch() {
  const row = div('roles');
  for (const role of DATA.roles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = role.label;
    if (state.role === role.id) button.className = 'is-on';
    button.addEventListener('click', () => {
      state.role = role.id;
      state.selected = null;
      render();
    });
    row.append(button);
  }
  return row;
}

function stats() {
  const screens = visibleScreens();
  const transitions = new Set();
  for (const screen of screens) {
    for (const target of screen.navigatesTo) {
      if (screens.some((item) => item.path === target))
        transitions.add(`${screen.path}->${target}`);
    }
  }
  for (const target of DATA.shell.navigatesTo) {
    if (screens.some((item) => item.path === target)) transitions.add(`shell->${target}`);
  }
  const apis = new Set();
  for (const call of [...screens.flatMap((screen) => screen.calls), ...DATA.shell.calls]) {
    if (call.path) apis.add(`${call.method} ${call.path}`);
  }
  const areaIds = new Set(screens.map((screen) => screen.areaId));
  const grid = div('stats');
  grid.append(
    stat(String(screens.length), 'экраны'),
    stat(String(transitions.size), 'переходы'),
    stat(String(apis.size), 'вызовы API'),
    stat(String(areaIds.size), 'зоны')
  );
  const note = document.createElement('p');
  note.className = 'total';
  note.textContent = `Во всём продукте ${DATA.screens.length} экранов и ${DATA.endpoints.length} связанных endpoint.`;
  const block = document.createElement('div');
  block.append(grid, note);
  return block;
}

function stat(value, label) {
  const box = div('stat');
  const number = document.createElement('b');
  number.textContent = value;
  const caption = document.createElement('span');
  caption.textContent = label;
  box.append(number, caption);
  return box;
}

function spine() {
  const row = div('spine');
  const paths = DATA.spines[state.role] || [];
  paths.forEach((path, index) => {
    if (index > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '→';
      row.append(arrow);
    }
    const screen = screenByPath(path);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'step' + (state.selected === path ? ' is-on' : '');
    const name = document.createElement('b');
    name.textContent = screen ? screen.title : path;
    const meta = document.createElement('small');
    meta.textContent = path;
    button.append(name, meta);
    button.addEventListener('click', () => select(path));
    row.append(button);
  });
  return row;
}

function areaGrid() {
  const grid = div('areas');
  const screens = visibleScreens();
  for (const area of DATA.areas) {
    const items = screens.filter((screen) => screen.areaId === area.id);
    if (items.length === 0) continue;
    const card = div('area');
    const heading = document.createElement('h2');
    heading.textContent = area.title;
    const blurb = document.createElement('p');
    blurb.textContent = area.blurb;
    const list = div('features');
    for (const screen of items) list.append(featureButton(screen));
    card.append(heading, blurb, list);
    grid.append(card);
  }
  return grid;
}

function featureButton(screen) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'feature' + (state.selected === screen.path ? ' is-on' : '');
  const name = document.createElement('b');
  name.textContent = screen.title;
  const meta = document.createElement('small');
  meta.textContent = screen.path;
  button.append(name, meta);
  button.addEventListener('click', () => select(screen.path));
  return button;
}

function board() {
  const grid = div('board');
  const screens = visibleScreens();
  const shellCol = div('column');
  const shellTitle = document.createElement('h2');
  shellTitle.textContent = 'Оболочка';
  shellCol.append(
    shellTitle,
    screenCard({ path: '__shell__', title: 'Шапка и сессия', component: 'shell' })
  );
  grid.append(shellCol);
  for (const area of DATA.areas) {
    const items = screens.filter((screen) => screen.areaId === area.id);
    if (items.length === 0) continue;
    const column = div('column');
    const heading = document.createElement('h2');
    heading.textContent = area.title;
    column.append(heading);
    for (const screen of items) column.append(screenCard(screen));
    grid.append(column);
  }
  const roles = roleSwitch();
  const wrap = document.createElement('div');
  wrap.append(roles, grid);
  return wrap;
}

function screenCard(screen) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card' + (state.selected === screen.path ? ' is-on' : '');
  const name = document.createElement('b');
  name.textContent = screen.title;
  const meta = document.createElement('small');
  meta.textContent = screen.path === '__shell__' ? 'на каждом экране' : screen.path;
  button.append(name, meta);
  button.addEventListener('click', () => select(screen.path));
  return button;
}

function select(path) {
  state.selected = state.selected === path ? null : path;
  render();
}

function panel(path) {
  const aside = document.createElement('aside');
  aside.className = 'panel';
  const isShell = path === '__shell__';
  const screen = isShell ? null : screenByPath(path);
  const calls = isShell ? DATA.shell.calls : screen?.calls || [];
  const links = isShell ? DATA.shell.navigatesTo : screen?.navigatesTo || [];

  const header = document.createElement('header');
  const heading = document.createElement('h2');
  heading.textContent = isShell ? 'Оболочка' : screen?.title || path;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Закрыть');
  close.addEventListener('click', () => {
    state.selected = null;
    render();
  });
  header.append(heading, close);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = isShell
    ? 'Шапка, вход и общие запросы'
    : `${screen?.path || ''} · ${screen?.component || ''} · ${screen?.file || ''}`;

  aside.append(header, meta, sectionTitle('Куда можно уйти'));
  if (links.length === 0) aside.append(note('Переходов с этого экрана не найдено'));
  for (const target of links) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'linkish';
    const found = screenByPath(target);
    button.textContent = found ? `${found.title}  ${target}` : target;
    button.addEventListener('click', () => {
      state.selected = target;
      render();
    });
    aside.append(button);
  }

  aside.append(sectionTitle('Что вызывается'));
  if (calls.length === 0) aside.append(note('Прямых вызовов API на этом экране нет'));
  for (const call of calls) {
    aside.append(callBlock(call));
  }
  return aside;
}

function callBlock(call) {
  const block = div('call');
  const line = document.createElement('div');
  const method = document.createElement('span');
  method.className = 'method';
  method.textContent = call.method;
  const path = document.createElement('span');
  path.className = 'path';
  path.textContent = call.path || 'путь не найден';
  line.append(method, path);
  const fn = document.createElement('div');
  fn.className = 'sub';
  fn.textContent = call.clientFn === 'fetch' ? 'fetch' : `api.${call.clientFn}`;
  block.append(line, fn);
  const endpoint = call.path ? endpointFor(call) : null;
  if (endpoint) {
    const handler = document.createElement('div');
    handler.className = 'sub';
    handler.textContent = `${endpoint.handler} · ${endpoint.handlerFile}`;
    block.append(handler);
    if (endpoint.services.length > 0) {
      const services = document.createElement('div');
      services.className = 'sub';
      services.textContent = endpoint.services.join(', ');
      block.append(services);
    }
    if (endpoint.tags.length > 0) {
      const tags = div('tags');
      for (const tag of endpoint.tags) {
        const pill = document.createElement('span');
        pill.className = 'tag';
        pill.textContent = tag;
        tags.append(pill);
      }
      block.append(tags);
    }
  } else if (call.path) {
    block.append(note('Handler не сопоставлен'));
  }
  if (call.callers.length > 0) {
    const callers = document.createElement('div');
    callers.className = 'sub';
    callers.textContent = call.callers.join(', ');
    block.append(callers);
  }
  return block;
}

function sectionTitle(text) {
  const heading = document.createElement('h3');
  heading.textContent = text;
  return heading;
}

function note(text) {
  const node = document.createElement('div');
  node.className = 'sub';
  node.textContent = text;
  return node;
}

function div(className) {
  const node = document.createElement('div');
  node.className = className;
  return node;
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.selected) {
    state.selected = null;
    render();
  }
});

render();
