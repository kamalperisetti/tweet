const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const passwordIsValid = (password) => {
  return password.length > 6;
};

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "kamalakar", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
}

// API 1

app.post("/register/", async (request, response) => {
  const { name, username, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  if (databaseUser === undefined) {
    const createUserQuery = `INSERT INTO
        user ( name, username, password, gender )
        VALUES 
            ('${name}',
            '${username}',
            '${hashedPassword}',
            '${gender}');`;
    if (passwordIsValid(password)) {
      await database.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectQuery);

  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatch === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "kamalakar");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = `SELECT user_id FROM user WHERE username = '${username}'`;
  const userId = await database.get(getUserId);
  const id = userId.user_id;

  const getFollowingQuery = `SELECT username, tweet, date_time AS dateTime 
  FROM follower INNER JOIN user on user.user_id = follower.following_user_id
  INNER JOIN tweet on user.user_id = tweet.user_id
  WHERE follower.following_user_id = ${id}
  ORDER BY dateTime ASC;`;

  const nameAndTweet = await database.all(getFollowingQuery);
  response.send(nameAndTweet);
});

// API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  console.log(username);

  const getUserId = `
  SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await database.get(getUserId);
  const id = userId.user_id;
  console.log(id);

  const getFollowerQuery = `
    SELECT
    name
  FROM follower INNER JOIN user on user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${id};`;

  const userName = await database.all(getFollowerQuery);
  response.send(userName);
});

// API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}'`;
  const userId = await database.get(getUserId);
  const id = userId.user_id;
  console.log(id);
  const userFollowersQuery = `
   SELECT 
    name
   FROM follower INNER JOIN user on user.user_id = follower.follower_user_id
    WHERE follower.following_user_id = ${id};`;
  const followewrName = await database.all(userFollowersQuery);
  response.send(followewrName);
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}'`;
  const userId = await database.get(getUserId);
  const id = userId.user_id;

  const tweetsQuery = `
   SELECT
   *
   FROM tweet
   WHERE tweet_id=${tweetId}
   `;

  const tweetResult = await database.get(tweetsQuery);
  const userFollowersQuery = `
    SELECT
    *
  FROM follower INNER JOIN user on user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${id};`;

  const userFollowers = await database.all(userFollowersQuery);

  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    const result1 = `SELECT tweet,
     COUNT(DISTINCT like_id) AS likes,
      COUNT(DISTINCT reply) AS replies,
       date_time AS dateTime
        FROM
         tweet INNER JOIN reply on tweet.tweet_id = reply.tweet_id
    INNER JOIN like on like.tweet_id WHERE tweet.tweet_id = ${tweetId}`;
    const res = await database.all(result1);
    response.send(res);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await database.get(getUserId);
    const id = userId.user_id;
    console.log(id);

    const getTweetId = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweetResult = await database.get(getTweetId);

    const userFollowingQuery = `SELECT
    * FROM follower INNER JOIN user on user.user_id = follower.following_user_id
    WHERE follower.follower_id = ${id};`;

    const userFollowers = await database.all(userFollowingQuery);

    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const getLikeUsers = `SELECT 
        username 
        FROM user INNER JOIN like on user.user_id = like.user_id WHERE like.tweet_id = ${tweetId}`;
      const likeUser = await database.all(getLikeUsers);
      response.send(likeUser);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await database.get(getUserId);
    const id = userId.user_id;
    console.log(id);

    const getUserFollowing = `SELECT * FROM follower INNER JOIN user on user.user_id = follower.following_user_id
    WHERE follower.follower_id = ${id};`;
    const userFollowers = await database.all(getUserFollowing);

    const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = '${tweetId}';`;
    const tweetResult = await database.get(getTweetQuery);

    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const getReplyQuery = `
        SELECT name, reply FROM user INNER JOIN reply on reply.user_id = user.user_id
        WHERE reply.tweet_id = ${tweetId};`;
      const reply = await database.all(getReplyQuery);
      response.send(reply);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await database.get(getUserId);
  const id = userId.user_id;
  console.log(id);

  const getTheDetails = `SELECT 
   DISTINCT tweet, reply, date_time 
    FROM tweet INNER JOIN reply on tweet.tweet_id = reply.tweet_id 
    INNER JOIN like on tweet.tweet_id = like.tweet_id ;`;

  const tweetDetails = await database.all(getTheDetails);
  response.send(tweetDetails);
});

// API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  console.log(tweet);

  const postTweetQuery = `INSERT INTO
   tweet (tweet) 
   VALUES 
   ('${tweet}');`;
  await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await database.get(getUserId);
    const id = userId.user_id;
    console.log(id);
    /*
    const delteUsser = `DELETE FROM tweet WHERE (tweet.tweet_id = '${tweetId}') AND (tweet.user_id = '${id}');`;
    await database.run(delteUsser);
    response.send("delteUsser");
*/

    const getTheTweet = `SELECT user_id FROM tweet WHERE tweet.tweet_id = '${tweetId}';`;
    const tweetResult = await database.all(getTheTweet);
    console.log(tweetResult);

    if (tweetResult.user_id === id) {
      const deleteTweet = `DELETE FROM tweet WHERE tweet.tweet_id = '${tweetId}';`;
      await database.run(deleteTweet);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
