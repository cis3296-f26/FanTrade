from flask import Flask

app = Flask(__name__)

@app.route('/')
def home():
    return "<h1>Fan Trade</h1><p>Welcome to Fan Trade!</p>"

@app.route('/')
def sign_in():
    return "<h1>Sign In</h1><p>Sign in here</p>"

@app.route('/trade-evaluation')
def trade_evaluation():
    return "<h1>Trade Evaluation</h1><p>Evaluate trades here</p>"

if __name__ == '__main__':
    app.run(debug=True)
