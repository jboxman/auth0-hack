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

server.get('/', (req, res) => {
  res.send('hello world');
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
      res.json(url);
    })
  });
});

server.get('/shrink', (req, res) => {
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
    storage.set(
      runReducer(data),
      function handleError(error) {
        if(error) {
          if(error.code == 409 && attempts--) {
            return storage.set(runReducer(data.count > error.conflict.count ? data : error.conflict), handleError);
          }
          res.send(500);
          return;
        }
        res.send(200);
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

    res.send(data);
  });
});

module.exports = webtask.fromExpress(server);
