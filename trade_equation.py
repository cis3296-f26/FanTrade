""" this is a tempory formula I am working on. my use case right now is WR's. Once that is accurate I will start on rest.
These are placeholder values for WR, RB, TE, QB, DEF, K. This is a starting point. 
So far, for my use case of receivers, the formula is based on the following factors:
- Receiving yards
- Touchdowns per game
- Points per reception

 TODO: update the weights in the formula. I will need to do some research on the best weights to use for each of these factors.
"""



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