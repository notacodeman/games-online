# Games

Card and party games to play in the browser with friends or against bots. Live at **https://games.codeman.club**.

The start page has three parts: **join with a code**, a list of **public games** (open lobbies to join, games in
progress to watch; refreshes every few seconds), and **create a lobby**: pick a game, choose public (listed) or
private (code or link only), and you get a lobby with an invite link where you can add bots and set house rules.
Each game can also be practiced against bots entirely in the browser.

## Games

**Last Card**: the UNO-style color-and-number game (the classic 108-card deck), 2–10 players. Official rules by
default; the host can change cards dealt, score to play to (or one round), Wild Draw Four challenges, playing the
drawn card, draw until playable, the Last card! penalty, stacking +2/+4, 7-0 hand swaps, jump-in, and a turn timer
(on by default at 15 seconds; when it runs out the player draws and the turn moves on). The lobby shows the timer,
score and cards dealt first; the rest are under "More rules".

Bots come in four levels, set per bot in the lobby (and for all bots in practice): **Easy** (random plays half the
time, forgetful), **Medium** (the original bot), **Hard** (tracks which color each player last drew on, keeps its
strongest color on top, dumps points when someone is close to going out) and **Impossible** (sees every hand). In
simulated games against three Medium bots, Easy won about 19% of rounds, Medium 25%, Hard 29% and Impossible 30%
(one-on-one: 39 / 50 / 55 / 62%): the deal decides a lot in this game, so the levels feel different without being
unbeatable. If the host starts a lobby with nobody but bots, the game runs in their browser like practice mode.
It's called Last Card with its own neon card design rather than using the UNO name and look, which are Mattel
trademarks.

**Spy Words**: the team word-clue game (Codenames-style), 2–16 players. Two teams, a 5×5 board; each team's
spymaster sees the secret key and gives one-word clues with a number, and operatives pick cards (tap to point so
teammates see, tap again to pick). With 2–3 people everyone plays on red and blue is played automatically, the
official small-group rule. House rules: 1–3 assassins, strict or honor-system clue check, a turn timer. No bots
(clues need a person), so no practice mode. The words are Cody's list in `lib/spy-words/words.js`; one word per
entry, capitals, spaces allowed.

**Sounds:** a soft tick every time a turn ends, a chime when it's your turn, plus card, draw, Last card!, caught and
round-over sounds. Made with the Web Audio API (no sound files). The Sound on/off button in the banner is remembered.

### Adding a game

1. Write its engine in `lib/<id>/game.js` with the same exports as `lib/last-card/game.js`: `newGame`, `addPlayer`,
   `applyAction`, `advance`, `viewFor`, `MIN_PLAYERS`, `MAX_PLAYERS`, and the lobby moves `addBot`, `removePlayer`,
   `setRules`, `start`, `leave`, `playAgain`. Throw `GameError` (`lib/errors.js`) for refused moves.
2. Its rule options in `lib/<id>/rules.js` (same shape as `lib/last-card/rules.js`).
3. Its table in `js/<id>/table.js` (same signature as `js/last-card/table.js`).
4. Add it to `lib/games.js` (with `bots` and `practice` true or false) and `js/games.js` (plus a lobby section
   in `LOBBY_PANELS` if it needs one, like Spy Words' teams). The lobby, public list, practice mode and API pick it up from there.

## How it works

The server holds the whole game (every hand and the draw pile) in one D1 row and only ever sends each player their
own view: their hand, and card counts for everyone else. Browsers poll `GET /api/games/<code>` and send moves to
`POST /api/games/<code>/action`. How often they poll depends on the game (`pollPace()` in each engine): every second
when your turn is next or a bot is moving, every 2 seconds on your own turn, every 3 seconds otherwise, and slower in
a background tab. A poll with nothing new gets a tiny `{ unchanged: true }` reply. Every write checks the
version it read, so two moves at once can't overwrite each other.

Pages Functions only run when called, so bots, bots catching a missed Last card! call, and the turn timer are
advanced by those polls: each poll makes at most one automatic move that's due (`advance()` in each game's engine).

The `games` row also keeps a few columns copied out of the state on every save (game, public, phase, host name,
player counts) so the public list is one small query.

A player's seat is a random token kept in their browser (`localStorage`), stored on the server only as a SHA-256
hash. Games are deleted after 15 minutes without a move (2 minutes once only bots are left, an hour after a game
ends) by a clear-out that runs at most every 5 minutes, started by the start page's list and by creating a game (not
by game polls, which would double the database calls).

## Files

Plain HTML, CSS and JavaScript (ES modules) with no build step.

| File | What's in it |
|---|---|
| `index.html` | The page: banner, the screen area, footer |
| `_headers` | Security headers for every page (Content-Security-Policy and friends) |
| `css/style.css` | All styles. Old-time tavern theme: wood, brass, green felt, paper cards (tokens at the top) |
| `js/app.js` | Start page (join by code, public games, create a lobby, practice) and switching screens; `?g=CODE` in the URL |
| `js/games.js` | The page's list of games: each one's table, extra lobby section and how-to-play notes |
| `js/lobby.js` | The lobby (invite link, public/private, players, bots, start) and the rules form |
| `js/online.js` | An online game: polling (faster when something is about to happen) and sending moves |
| `js/practice.js` | A practice game run in the browser, for any game |
| `js/sound.js` | The sound effects (Web Audio) and the mute setting |
| `js/dialogs.js` | The pick-one dialog (colors, players) |
| `js/util.js` | DOM helper, API calls, browser storage, toasts |
| `js/last-card/table.js` | Last Card's table: seats, piles, your hand, status and buttons, round results, log, which sound to play |
| `js/last-card/cards.js` | Drawing a Last Card card face or back |
| `js/spy-words/table.js` | Spy Words' table (score, clue, board, teams, log) and its lobby section for teams and spymasters |
| `lib/games.js` | Every game on the site: name, blurb, player counts, engine, rules |
| `lib/room.js` | What the site adds around a game: which game, public or private, the list summary |
| `lib/errors.js` | `GameError`: a refused move, shown to the player |
| `lib/last-card/game.js` | Last Card's engine: deck, moves, card effects, scoring, bots' timing, each player's view |
| `lib/last-card/bot.js` | How Last Card bots choose their moves, and the four difficulty levels |
| `lib/last-card/rules.js` | Last Card's rule options, their official values and notes |
| `lib/spy-words/game.js` | Spy Words' engine: teams, dealing the board and key, clues, guesses, the automatic team, each player's view |
| `lib/spy-words/rules.js` | Spy Words' rule options |
| `lib/spy-words/words.js` | The word list |
| `lib/store.js` | Games in D1: codes, tokens, load/save with version checks, the public list, the clear-out |
| `lib/limits.js` | Rate limits kept in D1 |
| `lib/api.js` | JSON response helpers for the Functions |
| `functions/schema.sql` | The D1 tables |
| `functions/api/_middleware.js` | Size limit, missing-database messages, refused moves as 409s, starts the clear-out |
| `functions/api/games/index.js` | `GET /api/games`: public games. `POST /api/games`: create a lobby |
| `functions/api/games/[code]/index.js` | `GET /api/games/<code>`: your view (and any automatic move that's due) |
| `functions/api/games/[code]/join.js` | `POST /api/games/<code>/join`: take a seat in the lobby |
| `functions/api/games/[code]/action.js` | `POST /api/games/<code>/action`: make a move (or `setPublic`) |

## Setup (Cloudflare Pages)

1. Create a GitHub repo `games-online` and push this folder.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo. No build command, output directory `/`.
3. Storage & Databases → D1 → create a database (e.g. `games`). Open its Console, paste `functions/schema.sql`, run it.
4. In the Pages project: Settings → Bindings → add a D1 database binding named `DB` pointing at it. Redeploy.
5. Custom domains → add `games.codeman.club`.

## Tunables

Named constants at the top of the files: bot thinking time and catch delay (`lib/last-card/game.js`), bot levels
(`lib/last-card/bot.js`), poll rates (`js/online.js`), public-list refresh and height (`js/app.js`), game lifetime
and how long a public game stays listed (`lib/store.js`), rate limits (`lib/limits.js`), log length
(`js/last-card/table.js`), volume (`js/sound.js`).
