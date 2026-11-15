# Lenny's Daily Kickoff

The site behind kickoff.lennyland.games: a short learning game for every school day.

- `index.html` is the home page. It shows today's game, this week and the weekend passcode.
- `e/NNN/index.html` is one day's game: its story, pictures, toys and quiz.
- `e/` lists all games.
- `editions.json` lists every game and its date.
- `assets/` is the shared game engine (pages, shootout, goals, leagues, streaks, vault).
- `automation/BUILDER.md` is what the daily builder follows; `automation/check.py` plays a game start to finish
  in a browser before it is published.

Built on [The Daily Wow kit](https://github.com/raphacoh/daily-wow-kit) by Raphael Cohen (MIT License).
