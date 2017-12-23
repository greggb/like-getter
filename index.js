var axios = require("axios");
var fs = require("fs");

const API_URL = "https://api.twitter.com/1.1/favorites/list.json";
const TOKEN_URL = "https://api.twitter.com/oauth2/token";

const MAX_ITERATIONS = 15;
const DELAY_NEXT_ITERATION = 2000;

class LikeGetter {
  /**
   * @param {Object} tokens
   * @param {Object} options
   *  @param {String} screen_name
   *  @param {Number} count
   */ constructor(tokens, options = {}) {
    if (!options.screen_name) {
      throw new Error("A screen_name is required");
    }
    this.screen_name = options.screen_name;
    this.count = options.count || 20;

    this.currentIteration = 1;
    this.lastId = "";
    this.likesJsonData;
    this.likesReceived = 0;

    this.didError = this.didError.bind(this);
    this.didReceiveLikes = this.didReceiveLikes.bind(this);
    this.finally = this.finally.bind(this);
    this.getLikes = this.getLikes.bind(this);
    this.getTweetString = this.getTweetString.bind(this);
    this.parseTokenReponse = this.parseTokenReponse.bind(this);
    this.setGlobalHeader = this.setGlobalHeader.bind(this);
    this.writeToFile = this.writeToFile.bind(this);

    const encodedKey = this.encodeKeys(tokens);

    this.getToken(encodedKey)
      .then(this.parseTokenReponse)
      .then(this.setGlobalHeader)
      .then(this.getLikes)
      .catch(this.didError);
  }
  encodeKeys({ consumerKey, consumerSecret }) {
    return new Buffer(`${consumerKey}:${consumerSecret}`).toString("base64");
  }
  getToken(encodedKey) {
    return axios({
      method: "post",
      url: TOKEN_URL,
      headers: {
        Authorization: `Basic ${encodedKey}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      data: "grant_type=client_credentials"
    });
  }
  parseTokenReponse({ data }) {
    try {
      const { access_token } = data;
      return access_token;
    } catch (e) {
      console.error(e);
      throw new Error("Could not get access token from request");
    }
  }

  setGlobalHeader(ACCESS_TOKEN) {
    axios.defaults.headers.common["Authorization"] = `Bearer ${ACCESS_TOKEN}`;
  }
  getLikes() {
    console.log("Getting Likes ⭐️️⭐️️⭐️️");
    const params = {
      count: this.count,
      screen_name: this.screen_name
    };

    if (this.lastId) {
      params.max_id = this.lastId;
    }
    axios
      .get(API_URL, { params })
      .then(this.didReceiveLikes)
      .then(this.writeToFile)
      .then(this.finally)
      .catch(this.didError);
  }
  didReceiveLikes({ data }) {
    const numberOfResults = data.length;
    console.log(`Received: ${numberOfResults} likes 💸`);
    if (!numberOfResults) {
      console.log("received 0 results 😐");
      return null;
    }
    // get the ID for the oldest tweet in the current result set
    const { id_str } = data[numberOfResults - 1];
    console.log("Next Iteration will use ID: ", id_str);
    // make sure we're setting a new ID or just bail.
    if (!id_str || id_str === this.lastId) {
      throw new Error(`Invalid ID: ${id_str}. Current ID: ${this.lastId}`);
    }
    this.lastId = id_str;
    this.likesJsonData = data;
    console.log("Formatting Tweets 🤖");
    return data.map(item => this.getTweetString(item)).join("\n\n");
  }
  didError(error) {
    if (error.response) {
      console.error("error.response.data");
      console.error(error.response.data);
      console.error("error.request");
      console.error(error.request);
    }
  }
  getTweetString(tweet, isQuotedTweet) {
    // Not sure I could have spent less time formatting this...
    // Save the raw JSON so I can clean this up.
    if (!tweet) {
      return "";
    }
    return `${
      isQuotedTweet ? `###### Quoted tweet` : `##### Favorited Tweet`
    }\n${tweet.text}\n\n- By: [${
      tweet.user.screen_name
    }](http://www.twitter.com/${tweet.user.screen_name}/status/${
      tweet.id_str
    }) (${tweet.user.name}): ${new Date(tweet.created_at).toLocaleString()}\n${
      tweet.entities.urls && tweet.entities.urls.length
        ? `- Links: ${tweet.entities.urls.map(
            url => `\n    - [${url.display_url}](${url.expanded_url})`
          )}
          \n${
            tweet.is_quote_status
              ? this.getTweetString(tweet.quoted_status, true)
              : ""
          }`
        : ""
    }
    `;
  }
  finally({ complete }) {
    console.log("Are we finished? 🤔");
    if (complete || this.currentIteration >= MAX_ITERATIONS) {
      console.log(
        "👍 ",
        ` Completed ${this.currentIteration} requests and received ${
          this.likesReceived
        } total likes 🎉`
      );
    } else {
      console.log("Nope, get some more! 🏎");
      this.currentIteration = this.currentIteration += 1;
      // If there is content there should be a lastId, but just in case...
      if (this.lastId) {
        setTimeout(() => {
          console.log(`Retrieving more data starting at ID: ${this.lastId}`);
          this.getLikes();
        }, DELAY_NEXT_ITERATION);
      }
    }
  }
  writeToFile(contents) {
    // Need option to batch the data into a String and Array instead of writing multiple 2 files per request
    if (!contents) {
      return { complete: true };
    }
    this.likesReceived += this.likesJsonData.length;

    console.log("Writing to files 📝📝📝");
    fs.writeFileSync(
      `likes-${this.lastId}-${this.currentIteration}.md`,
      contents,
      err => console.log(err || "Markdown written")
    );

    fs.writeFileSync(
      `likes-${this.lastId}-${this.currentIteration}.json`,
      JSON.stringify(this.likesJsonData),
      err => console.log(err || "JSON Data written")
    );

    console.log(
      `Wrote ${this.likesJsonData.length} likes to disk. Currently on ${
        this.currentIteration
      } of ${MAX_ITERATIONS} requests`
    );
    return { complete: false };
  }
}
/**See https://developer.twitter.com/en/docs/basics/authentication/overview/application-only for token info **/
const Likes = new LikeGetter(
  {
    consumerKey: "",
    consumerSecret: "",
    accessToken: "",
    accessTokenSecret: ""
  },
  { screen_name: "", count: 20 }
);
