"""
Pure tennis scoring logic. A `TennisEngine` wraps a `models.Match` row and,
given the winner of the next point, mutates the match's live scoreboard
fields (sets/games/points/server/tiebreak) and returns the snapshot info
needed to persist the corresponding `Point` row.

Rules implemented:
- Standard game scoring (0/15/30/40, deuce/ad).
- Sets to 6 games, win by 2, with a 7-point tiebreak at 6-6
  (unless `final_set_tiebreak=False` and this is the deciding set, in which
  case play continues past 6-6 until a 2-game lead).
- Best of 3 or Best of 5 sets.
- Correct server rotation, including the "1 point, then alternate every 2"
  serving pattern inside a tiebreak.
- Deuce/Ad court determined by parity of total points played in the
  current game (same rule applies inside a tiebreak).
"""

from models import PlayerEnum, MatchFormat

SETS_TO_WIN = {MatchFormat.bo3: 2, MatchFormat.bo5: 3}
GAME_LABELS = {0: "0", 1: "15", 2: "30", 3: "40"}


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


def would_win_game(p1_pts: int, p2_pts: int, is_tiebreak: bool, candidate: str) -> bool:
    """Would `candidate` clinch the game/tiebreak by winning the NEXT point?"""
    np1, np2 = p1_pts, p2_pts
    if candidate == PlayerEnum.player1:
        np1 += 1
    else:
        np2 += 1
    if is_tiebreak:
        return (np1 >= 7 or np2 >= 7) and abs(np1 - np2) >= 2
    if np1 >= 4 or np2 >= 4:
        return abs(np1 - np2) >= 2
    return False


def would_win_set(p1_games: int, p2_games: int, candidate: str) -> bool:
    """Would `candidate` clinch the set by winning the game they'd get from
    winning the next point (i.e. one more game added to their current tally)?"""
    ng1, ng2 = p1_games, p2_games
    if candidate == PlayerEnum.player1:
        ng1 += 1
    else:
        ng2 += 1
    if (ng1 >= 6 or ng2 >= 6) and abs(ng1 - ng2) >= 2:
        return True
    if ng1 == 7 or ng2 == 7:
        return True
    return False


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
        is_tiebreak_before = m.is_tiebreak

        set_num  = m.p1_sets + m.p2_sets + 1
        game_num = m.cur_p1_games + m.cur_p2_games + 1
        game_score_before = game_score_display(m.cur_p1_pts, m.cur_p2_pts, m.is_tiebreak)
        set_score_before  = f"{m.cur_p1_games}-{m.cur_p2_games}"
        sets_score_before = f"{m.p1_sets}-{m.p2_sets}"

        # game/set/match point detection (based on state BEFORE this point)
        game_point_for = None
        for cand in (PlayerEnum.player1, PlayerEnum.player2):
            if would_win_game(m.cur_p1_pts, m.cur_p2_pts, m.is_tiebreak, cand):
                game_point_for = cand
                break

        set_point_for = None
        match_point_for = None
        if game_point_for is not None and would_win_set(m.cur_p1_games, m.cur_p2_games, game_point_for):
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
        target = 7 if m.is_tiebreak else 4
        if (m.cur_p1_pts >= target or m.cur_p2_pts >= target) and abs(m.cur_p1_pts - m.cur_p2_pts) >= 2:
            game_winner_now = PlayerEnum.player1 if m.cur_p1_pts > m.cur_p2_pts else PlayerEnum.player2

        if game_winner_now is not None:
            game_won = True
            if game_winner_now == PlayerEnum.player1:
                m.cur_p1_games += 1
            else:
                m.cur_p2_games += 1

            m.cur_p1_pts = 0
            m.cur_p2_pts = 0
            m.is_tiebreak = False
            m.server = other(m.server)   # serve alternates every game (breaker counts as one game)

            g1, g2 = m.cur_p1_games, m.cur_p2_games
            set_winner_now = None
            if (g1 >= 6 or g2 >= 6) and abs(g1 - g2) >= 2:
                set_winner_now = PlayerEnum.player1 if g1 > g2 else PlayerEnum.player2
            elif g1 == 7 or g2 == 7:
                set_winner_now = PlayerEnum.player1 if g1 > g2 else PlayerEnum.player2

            if set_winner_now is not None:
                set_won = True
                hist = m.sets_history_list()
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
            else:
                # entering a tiebreak?
                is_deciding_set = (m.p1_sets + m.p2_sets + 1) == (2 * SETS_TO_WIN[m.format] - 1)
                allow_tiebreak = m.final_set_tiebreak or not is_deciding_set
                if g1 == 6 and g2 == 6 and allow_tiebreak:
                    m.is_tiebreak = True

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
