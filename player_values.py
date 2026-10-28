""" this is a tempory formula I am working on. my use case right now is WR's. Once that is accurate I will start on rest.
These are placeholder values for WR, RB, TE, QB, DEF, K. This is a starting point. 
So far, for my use case of receivers, the formula is based on the following factors:
- Receiving yards
- Touchdowns per game
- Points per reception

 TODO: update the weights in the formula. I will need to do some research on the best weights to use for each of these factors.
"""

#MAKE SURE WE ARE USING AVERAGE STATS!!!!!

# QB's stats
def calculate_qb_value(avg_passing_yards, avg_rushing_yards, avg_passing_touchdowns, avg_rushing_touchdowns, avg_receiving_yards, avg_receiving_touchdowns, avg_interceptions, avg_fumbles_lost, avg_two_pt_conversion, avg_receptions, points_per_reception=0):
    return (
        avg_passing_yards * 0.04
        + avg_rushing_yards * 0.1
        + avg_passing_touchdowns * 4
        + avg_rushing_touchdowns * 6
        + avg_receiving_yards * 0.1
        + avg_receiving_touchdowns * 6
        + avg_interceptions * -2
        + avg_fumbles_lost * -2
        + avg_two_pt_conversion * 2
        + avg_receptions * points_per_reception
    )
# WR's stats
def calculate_wr_value(avg_passing_yards, avg_rushing_yards, avg_passing_touchdowns, avg_rushing_touchdowns, avg_receiving_yards, avg_receiving_touchdowns, avg_interceptions, avg_fumbles_lost, avg_two_pt_conversion, avg_receptions, points_per_reception=0):
    return (
        avg_passing_yards * 0.04
        + avg_rushing_yards * 0.1
        + avg_passing_touchdowns * 4
        + avg_rushing_touchdowns * 6
        + avg_receiving_yards * 0.1
        + avg_receiving_touchdowns * 6
        + avg_interceptions * -2
        + avg_fumbles_lost * -2
        + avg_two_pt_conversion * 2
        + avg_receptions * points_per_reception
    )
# RB's stats
def calculate_rb_value(avg_passing_yards, avg_rushing_yards, avg_passing_touchdowns, avg_rushing_touchdowns, avg_receiving_yards, avg_receiving_touchdowns, avg_interceptions, avg_fumbles_lost, avg_two_pt_conversion, avg_receptions, points_per_reception=0):
    return (
        avg_passing_yards * 0.04
        + avg_rushing_yards * 0.1
        + avg_passing_touchdowns * 4
        + avg_rushing_touchdowns * 6
        + avg_receiving_yards * 0.1
        + avg_receiving_touchdowns * 6
        + avg_interceptions * -2
        + avg_fumbles_lost * -2
        + avg_two_pt_conversion * 2
        + avg_receptions * points_per_reception
    )
# TE's stats
def calculate_te_value(avg_passing_yards, avg_rushing_yards, avg_passing_touchdowns, avg_rushing_touchdowns, avg_receiving_yards, avg_receiving_touchdowns, avg_interceptions, avg_fumbles_lost, avg_two_pt_conversion, avg_receptions, points_per_reception=0):
    return (
        avg_passing_yards * 0.04
        + avg_rushing_yards * 0.1
        + avg_passing_touchdowns * 4
        + avg_rushing_touchdowns * 6
        + avg_receiving_yards * 0.1
        + avg_receiving_touchdowns * 6
        + avg_interceptions * -2
        + avg_fumbles_lost * -2
        + avg_two_pt_conversion * 2
        + avg_receptions * points_per_reception
    )
# DEF's stats - NEED TO UPDATE
def calculate_def_value(avg_sacks, avg_interceptions, avg_fumble_recoveries, avg_touchdowns, avg_Forced_fumbles_lost, avg_safeties):
    return (
        avg_sacks * 1
        + avg_interceptions * 2
        + avg_fumble_recoveries * 2
        + avg_touchdowns * 6
        + avg_Forced_fumbles_lost * 1
        + avg_safeties * 2
    )
# K's stats - NEED TO UPDATE
def calculate_k_value(avg_field_goals_made, avg_extra_points_made, avg_missed_field_goals, avg_passing_touchdowns, avg_passing_yards, avg_rushing_yards, avg_rushing_touchdowns, avg_receiving_yards, avg_receiving_touchdowns, avg_two_pt_conversion=0):
    return (
        avg_field_goals_made * 3
        + avg_extra_points_made * 1
        + avg_missed_field_goals * -1
        + avg_passing_touchdowns * 4
        + avg_passing_yards * 0.04  
        + avg_rushing_yards * 0.1
        + avg_rushing_touchdowns * 6
        + avg_receiving_yards * 0.1
        + avg_receiving_touchdowns * 6
        + avg_two_pt_conversion * 2
    )