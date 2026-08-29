# Sourced by husky hooks. Git GUI clients (Cursor, VS Code) spawn hooks with a
# stripped PATH that does not include nvm or Homebrew, so `npx`/`npm`/`node` fail.

add_path() {
  [ -d "$1" ] || return 0
  case ":$PATH:" in
    *":$1:"*) ;;
    *) PATH="$1:$PATH" ;;
  esac
}

# Lowest priority first; later prepends win.
add_path "/usr/local/bin"
add_path "/opt/homebrew/bin"
add_path "/c/nvm4w/nodejs"
if [ -n "${LOCALAPPDATA:-}" ]; then
  add_path "$LOCALAPPDATA/nvm"
  add_path "$LOCALAPPDATA/nodejs"
fi

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
wanted=""
if [ -f .nvmrc ]; then
  wanted=$(tr -d 'v \t\r\n' < .nvmrc)
fi

picked=""
if [ -n "$wanted" ] && [ -d "$NVM_DIR/versions/node" ]; then
  for dir in "$NVM_DIR/versions/node"/v"$wanted"*; do
    if [ -x "$dir/bin/node" ]; then
      picked="$dir/bin"
    fi
  done
fi

if [ -z "$picked" ] && [ -d "$NVM_DIR/versions/node" ]; then
  for dir in "$NVM_DIR/versions/node"/v*; do
    if [ -x "$dir/bin/node" ]; then
      picked="$dir/bin"
    fi
  done
fi

if [ -n "$picked" ]; then
  add_path "$picked"
fi

export PATH
