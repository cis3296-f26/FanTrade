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
""" Method for evaluating a trade between two players. The method takes in the give_value and receive_value of the trade, which are lists of values for each player involved in the trade. 
The method calculates the total value of each side of the trade and returns the highest total value.
"""
def evaluate_trade(give_value, receive_value): 
    give_total = sum(give_value)
    receive_total = sum(receive_value)
    highest_total = max(give_total, receive_total)

    if highest_total == 0:
        return "Both sides of the trade have a total value of 0. No trade evaluation can be made."

    advantage = ((receive_total - give_total) / highest_total) * 100

    if advantage > 15:
        return f"The trade is favorable for you with an advantage of {advantage:.2f}%."
    elif advantage > 5:
        return f"The trade is slightly favorable for you with an advantage of {advantage:.2f}%."
    elif advantage > -5:
        return f"The trade is neutral with an advantage of {advantage:.2f}%."
    elif advantage > -15:
        return f"The trade is slightly unfavorable for you with a disadvantage of {abs(advantage):.2f}%."
    else:
        return f"The trade is unfavorable for you with a disadvantage of {abs(advantage):.2f}%."