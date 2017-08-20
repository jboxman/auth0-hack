const express = require('express');
const webtask = require('webtask-tools');
const urlRegex = require('url-regex');

const server = express();

const maxKeyLength = 7;

// http://stackoverflow.com/questions/9542726/is-it-possible-to-base-36-encode-with-javascript-jquery
const decodeId = id => parseInt(id.length > maxKeyLength ? '^' : id, 36);
const encodeId = id => id.toString(36);

const initialData = {
  count: 0,
  urls: {}
};
const findUrlById = (id, data, done) => {
  const entry = data.urls[id];
  if(!entry) {
    done(false);
    return;
  }
  done(null, entry.url);
};
const reducer = (state = initialData, action) => {
  let newState = {
    ...state,
    count: (state.count + 1),
    urls: {
      ...state.urls,
      [action.id]: {
        id: action.id,
        url: action.url
      }
    }
  };
  return newState;
};

const page = `
  <html>
  <title>auth0 tiny url hack</title>
  <body>
  <h1>url hack</h1>
  <p>
  Use the endpoints below to convert a URL to its base36 representation and back again. All successful replies return JSON documents.
  </p>
  <h2>GET /explode?id=[id]</h2>
  <p>Takes an id in the query string. Returns the original URL.</p>
  <h2>POST /shrink?url=[url]</h2>
  <p>Takes a URL in the query string. Returns a base36 encoded representation of the URL. The post body is ignored.</p>
  <h2>GET /stats</h2>
  <p>Returns the number of URLs saved in the store in a JSON document.</p>
  </body>
  </html>
`;

server.get('/', (req, res) => {
  res.send(page);
});

// req.webtaskContext
server.get('/explode', (req, res) => {
  const {query, storage} = req.webtaskContext;
  storage.get((error, data) => {
    if(error) {
      res.send(500);
      return;
    }

    findUrlById(query.id, data, (error, url) => {
      if(error) {
        res.send(404);
        return;
      }
      res.json({url});
    })
  });
});

server.post('/shrink', (req, res) => {
  const {query, storage} = req.webtaskContext;
  const url = query.url;

  if(!urlRegex().test(url)) {
    res.status(400).send('Invalid URL');
    return;
  }

  const runReducer = (data) => (
    reducer(
      data,
      {
        id: encodeId(data.count + 1),
        url
      })
  );

  storage.get((error, data = initialData) => {
    if(error) {
      res.send(500);
      return;
    }
    // handle re-tries
    // https://webtask.io/docs/storage
    let attempts = 3;
    let newState = runReducer(data);
    storage.set(
      newState,
      function handleError(error) {
        if(error) {
          if(error.code == 409 && attempts--) {
            newState = runReducer(data.count > error.conflict.count ? data : error.conflict);
            return storage.set(newState, handleError);
          }
          res.send(500);
          return;
        }
        res.send({id: encodeId(newState.count)});
      }
    );
  });
});

server.get('/stats', (req, res) => {
  const {storage} = req.webtaskContext;
  storage.get((error, data = initialData) => {
    if(error) {
      res.send(500);
      return;
    }

    res.json(data.count);
  });
});

module.exports = webtask.fromExpress(server);
