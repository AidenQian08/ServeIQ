"""
Pure tennis scoring logic. A `TennisEngine` wraps a `models.Match` row and,
given the winner of the next point, mutates the match's live scoreboard
fields (sets/games/points/server/tiebreak) and returns the snapshot info
needed to persist the corresponding `Point` row.

Rules implemented:
- Standard game scoring (0/15/30/40, deuce/ad).
- Sets to 6 games, win by 2, with a 7-point tiebreak at 6-6.
- Best of 3 or Best of 5 sets.
- Two ways to play the deciding set (3rd of a bo3 / 5th of a bo5), chosen per
  match via `Match.deciding_set`:
    * `full_set`          — a normal set, 7-point tiebreak at 6-6.
    * `match_tiebreak_10` — no games at all; the deciding set IS a single
                            10-point tiebreak (win by 2).
  Every deciding set therefore ends in a tiebreak; advantage sets (play on
  past 6-6 to a 2-game lead) are not supported.
- Correct server rotation, including the "1 point, then alternate every 2"
  serving pattern inside a tiebreak (of either length).
- Deuce/Ad court determined by parity of total points played in the
  current game (same rule applies inside a tiebreak).
"""

from models import PlayerEnum, MatchFormat, DecidingSet

SETS_TO_WIN = {MatchFormat.bo3: 2, MatchFormat.bo5: 3}
GAME_LABELS = {0: "0", 1: "15", 2: "30", 3: "40"}

# Points needed to take a game / a set tiebreak / a deciding-set match tiebreak.
# All three are "reach the target AND lead by 2".
GAME_TARGET = 4
SET_TIEBREAK_TARGET = 7
MATCH_TIEBREAK_TARGET = 10


def other(p: str) -> str:
    return PlayerEnum.player2 if p == PlayerEnum.player1 else PlayerEnum.player1


def current_side(p1_pts: int, p2_pts: int) -> str:
    """Deuce court on even total points played in the game, Ad court on odd."""
    return "deuce" if (p1_pts + p2_pts) % 2 == 0 else "ad"


def game_score_display(p1_pts: int, p2_pts: int, is_tiebreak: bool) -> str:
    if is_tiebreak:
        return f"{p1_pts}-{p2_pts}"
    if p1_pts >= 3 and p2_pts >= 3:
        if p1_pts == p2_pts:
            return "Deuce"
        return "Ad-P1" if p1_pts > p2_pts else "Ad-P2"
    return f"{GAME_LABELS.get(p1_pts, str(p1_pts))}-{GAME_LABELS.get(p2_pts, str(p2_pts))}"


def is_deciding_set(m) -> bool:
    """Is the set currently in progress the deciding set (3rd of a bo3 / 5th of a bo5)?"""
    return (m.p1_sets + m.p2_sets + 1) == (2 * SETS_TO_WIN[m.format] - 1)


def uses_match_tiebreak(m) -> bool:
    """Does this match replace its deciding set with a 10-point match tiebreak?"""
    return m.deciding_set == DecidingSet.match_tiebreak_10


def is_match_tiebreak(m) -> bool:
    """Is the tiebreak in progress the deciding-set match tiebreak (to 10)?"""
    return m.is_tiebreak and is_deciding_set(m) and uses_match_tiebreak(m)


def point_target(m) -> int:
    """Points needed to win the game or tiebreak currently in progress."""
    if not m.is_tiebreak:
        return GAME_TARGET
    return MATCH_TIEBREAK_TARGET if is_match_tiebreak(m) else SET_TIEBREAK_TARGET


def would_win_game(p1_pts: int, p2_pts: int, target: int, candidate: str) -> bool:
    """Would `candidate` clinch the game/tiebreak by winning the NEXT point?

    `target` is the points needed (see point_target) — a game is simply
    "reach 4, lead by 2", which is the same shape as either tiebreak."""
    np1, np2 = p1_pts, p2_pts
    if candidate == PlayerEnum.player1:
        np1 += 1
    else:
        np2 += 1
    if np1 >= target or np2 >= target:
        return abs(np1 - np2) >= 2
    return False


def would_win_set(m, candidate: str) -> bool:
    """Would `candidate` clinch the set by winning the game/tiebreak in progress?"""
    # A won tiebreak always takes the set — the 7-pointer makes it 7-6, and the
    # deciding-set match tiebreak IS the set.
    if m.is_tiebreak:
        return True
    ng1, ng2 = m.cur_p1_games, m.cur_p2_games
    if candidate == PlayerEnum.player1:
        ng1 += 1
    else:
        ng2 += 1
    # 6-5 -> 7-5 takes it; 5-5 -> 6-5 does not; 6-6 -> 7-6 does not (tiebreak instead).
    return (ng1 >= 6 or ng2 >= 6) and abs(ng1 - ng2) >= 2


def tiebreak_server(start_server: str, point_index: int) -> str:
    """point_index is the 0-based index of the point about to be played
    inside the breaker. Server sequence: start, other, other, start, start,
    other, other, ... (serve switches after the 1st point, then every 2)."""
    if point_index == 0:
        return start_server
    block = (point_index - 1) // 2
    return other(start_server) if block % 2 == 0 else start_server


class TennisEngine:
    def __init__(self, match):
        self.m = match

    def next_side_and_server(self):
        """Side/server for the point about to be played, WITHOUT mutating state."""
        m = self.m
        if m.is_tiebreak:
            idx = m.cur_p1_pts + m.cur_p2_pts
            server = tiebreak_server(m.server, idx)
        else:
            server = m.server
        side = current_side(m.cur_p1_pts, m.cur_p2_pts)
        return server, side

    def apply_point(self, winner: str) -> dict:
        """Applies the point (winner = PlayerEnum.player1/player2), mutates
        the match's live scoreboard fields, and returns the snapshot dict
        needed to build the Point row (scores etc. as they were BEFORE this
        point was played)."""
        m = self.m
        server, side = self.next_side_and_server()
        # Snapshot everything the rules depend on, so nothing below is sensitive
        # to the order in which we mutate the scoreboard.
        is_tiebreak_before = m.is_tiebreak
        was_match_tiebreak = is_match_tiebreak(m)
        target = point_target(m)

        set_num  = m.p1_sets + m.p2_sets + 1
        game_num = m.cur_p1_games + m.cur_p2_games + 1
        game_score_before = game_score_display(m.cur_p1_pts, m.cur_p2_pts, m.is_tiebreak)
        set_score_before  = f"{m.cur_p1_games}-{m.cur_p2_games}"
        sets_score_before = f"{m.p1_sets}-{m.p2_sets}"

        # game/set/match point detection (based on state BEFORE this point)
        game_point_for = None
        for cand in (PlayerEnum.player1, PlayerEnum.player2):
            if would_win_game(m.cur_p1_pts, m.cur_p2_pts, target, cand):
                game_point_for = cand
                break

        set_point_for = None
        match_point_for = None
        if game_point_for is not None and would_win_set(m, game_point_for):
            set_point_for = game_point_for
            sets_needed = SETS_TO_WIN[m.format]
            cur_sets = m.p1_sets if game_point_for == PlayerEnum.player1 else m.p2_sets
            if cur_sets + 1 >= sets_needed:
                match_point_for = game_point_for

        # ── apply the point ────────────────────────────────────────────────
        if winner == PlayerEnum.player1:
            m.cur_p1_pts += 1
        else:
            m.cur_p2_pts += 1

        game_won = set_won = match_won = False

        game_winner_now = None
        if (m.cur_p1_pts >= target or m.cur_p2_pts >= target) and abs(m.cur_p1_pts - m.cur_p2_pts) >= 2:
            game_winner_now = PlayerEnum.player1 if m.cur_p1_pts > m.cur_p2_pts else PlayerEnum.player2

        if game_winner_now is not None:
            game_won = True
            # Final score of the game/tiebreak just won, before we clear it — a
            # match tiebreak is recorded in sets_history by its points (e.g. 10-8).
            won_p1_pts, won_p2_pts = m.cur_p1_pts, m.cur_p2_pts

            # A match tiebreak plays no games, so there is no game to credit.
            if not was_match_tiebreak:
                if game_winner_now == PlayerEnum.player1:
                    m.cur_p1_games += 1
                else:
                    m.cur_p2_games += 1

            m.cur_p1_pts = 0
            m.cur_p2_pts = 0
            m.is_tiebreak = False
            m.server = other(m.server)   # serve alternates every game (breaker counts as one game)

            g1, g2 = m.cur_p1_games, m.cur_p2_games
            if is_tiebreak_before:
                # Any won tiebreak takes the set: the 7-pointer makes it 7-6, and
                # the deciding-set match tiebreak IS the set.
                set_winner_now = game_winner_now
            elif (g1 >= 6 or g2 >= 6) and abs(g1 - g2) >= 2:
                set_winner_now = PlayerEnum.player1 if g1 > g2 else PlayerEnum.player2
            else:
                set_winner_now = None

            if set_winner_now is not None:
                set_won = True
                hist = m.sets_history_list()
                if was_match_tiebreak:
                    hist.append({"p1": won_p1_pts, "p2": won_p2_pts})
                else:
                    hist.append({"p1": g1, "p2": g2})
                m.set_sets_history_list(hist)

                if set_winner_now == PlayerEnum.player1:
                    m.p1_sets += 1
                else:
                    m.p2_sets += 1
                m.cur_p1_games = 0
                m.cur_p2_games = 0

                sets_needed = SETS_TO_WIN[m.format]
                if m.p1_sets >= sets_needed or m.p2_sets >= sets_needed:
                    match_won = True
                    m.is_complete = True
                    m.winner = PlayerEnum.player1 if m.p1_sets > m.p2_sets else PlayerEnum.player2
                elif is_deciding_set(m) and uses_match_tiebreak(m):
                    # The set that just started IS a 10-point match tiebreak —
                    # it begins immediately, with no games played.
                    m.is_tiebreak = True
            elif g1 == 6 and g2 == 6:
                m.is_tiebreak = True   # 6-6 -> 7-point set tiebreak

        return {
            "set_num": set_num,
            "game_num": game_num,
            "is_tiebreak": is_tiebreak_before,
            "server": server,
            "side": side,
            "game_score_display": game_score_before,
            "set_score_display": set_score_before,
            "sets_score_display": sets_score_before,
            "game_point_for": game_point_for,
            "set_point_for": set_point_for,
            "match_point_for": match_point_for,
            "game_won": game_won,
            "set_won": set_won,
            "match_won": match_won,
        }
