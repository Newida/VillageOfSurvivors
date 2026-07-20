# Nightfall Village

Nightfall Village is a player-hosted co-op survival game. The desktop build contains the game, its local multiplayer server, and its runtime, so a Windows host can start it without installing Node.js or running terminal commands.

## Linux development

Install Node.js 24 and npm, then install the locked dependencies:

```bash
npm ci
```

Run the complete desktop app:

```bash
npm run desktop:dev
```

For browser-focused development, run the host with automatic server restarts and open the URL printed in the terminal:

```bash
npm run dev
```

Run the automated host, static-file, and lobby WebSocket checks with:

```bash
npm test
```

## Local Linux build

Create a single-file x64 AppImage:

```bash
npm run build:linux
```

The result is written to `dist/NightfallVillage-<version>-Linux-x64.AppImage`. Make a downloaded AppImage executable before launching it:

```bash
chmod +x NightfallVillage-*.AppImage
./NightfallVillage-*.AppImage
```

## Automated Windows builds

The `Desktop builds` GitHub Actions workflow runs the tests and builds on native Linux and Windows runners. It runs for pull requests, pushes to `main`, version tags, and manual starts from the GitHub **Actions** tab.

This means Linux developers do not need Windows, Wine, or Electron build tools installed globally:

1. Push the source to GitHub.
2. Open **Actions → Desktop builds**.
3. Open the successful workflow run.
4. Download `NightfallVillage-Windows-x64` from **Artifacts**.
5. Extract the artifact ZIP and send the enclosed `.exe` to testers.

The result is a portable x64 Windows executable named `NightfallVillage-<version>-Windows-x64.exe`. It does not run an installer and does not require Node.js.

Workflow artifacts are retained for 14 days. For a permanent downloadable build, create a version tag whose value matches the version in `package.json`. After merging and updating `main`, a typical patch release is:

```bash
git switch main
git pull
npm version patch
git push --follow-tags
```

The tag build creates a GitHub Release and attaches both the Windows executable and Linux AppImage.

## Hosting for friends

1. The host double-clicks the Windows `.exe` or launches the Linux AppImage.
2. If Windows Firewall asks, allow access on private networks so friends on the same network can connect.
3. Everyone waits in the lobby. The first player is the host.
4. The host clicks **Invite** and sends the copied link to the other players.
5. Friends open that link in a modern browser; they do not need to install the game.
6. Once everyone has joined, the host starts the game from the lobby.

The desktop build prefers port `3000` and automatically selects another free port if it is already occupied. Same-network play works directly. Public internet play still requires port forwarding, a VPN, or a trusted tunnel.

Unsigned test executables can trigger Windows reputation warnings. Only distribute builds directly to people who trust their source; code signing should be added before a public release.

## Current multiplayer scope

- Up to four players per room
- A pre-game lobby with a host-only **Start game** action
- Other players are visible in the world and their movement is synchronized
- Village materials, upgrades, workers, and tribute progress are shared
- The invite button copies the current room URL

Enemies, resource nodes, combat, and the live day/night simulation still run locally on each client. Moving those systems into the host's authoritative simulation is the next step toward complete co-op play.

## Licensing

See [LICENSING.md](LICENSING.md) for the source-code, official-content, modding, and contribution terms. The complete Mozilla Public License 2.0 is included in [LICENSE](LICENSE).
