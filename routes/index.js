var express = require('express');
var router = express.Router();
var userSession;

/* GET home page. To remove after*/
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

/***************************** Utils ***************************/
function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}
/** Get user Session queries With Results return "['query1','query2' ...]" */
function init(req){
  if(userSession === undefined){
    userSession = req.session;
    userSession["recentRdfQueries"] = new Map();
    userSession["recentQDAGQueries"] = new Map();
    userSession["recentRequests"] = new Set();
    //That would store all the recent queries with their results
    userSession["queriesWithResults"] = new Set();
    //the key index of the query
    userSession["nextQueryIndex"] = 1;
  }
}
function setResultParameters(initialQueryConfig,exectTime,nbrResult,result){
    initialQueryConfig["execTimeQDAG"] = exectTime;
    initialQueryConfig["nbrResult"] = nbrResult;
    initialQueryConfig["result"] = result; 
}
function executeQDAGQuery(initialQueryConfig){
  const qdagParameters = JSON.stringify({currentDB:initialQueryConfig["currentDB"],query:initialQueryConfig["query"],
                        optimizer:initialQueryConfig["optimizer"],isElag:initialQueryConfig["isElag"],isSpatial:initialQueryConfig["isSpatial"],
                        spatialStrategy:initialQueryConfig["spatialStrategy"]});
  if(userSession["recentQDAGQueries"].has(qdagParameters)){
    console.log("After 3amora",userSession["recentQDAGQueries"].get(qdagParameters));
      const result = userSession["recentQDAGQueries"].get(qdagParameters);
      setResultParameters(initialQueryConfig,result["execTimeQDAG"],result["nbrResult"], result["result"]);
  } else {
      setResultParameters(initialQueryConfig,getRandomArbitrary(1000,5000),4000,"<mancity>\n</pogba>");
      userSession["recentQDAGQueries"].set(qdagParameters,{execTimeQDAG:initialQueryConfig["execTimeQDAG"],nbrResult:initialQueryConfig["nbrResult"],
                                                                result:initialQueryConfig["result"]});
      console.log("After store",userSession["recentQDAGQueries"]);
  }
}
function executeRDFQuery(initialQueryConfig){
  const rdfParameters = JSON.stringify({currentDB:initialQueryConfig["currentDB"],query:initialQueryConfig["query"]});
  //check if rdf3x [currentDb,query] has been already executed
  if(userSession["recentRdfQueries"].has(rdfParameters))
      initialQueryConfig["execTimeRDF"] = userSession["recentRdfQueries"].get(rdfParameters);
  else {
      initialQueryConfig["execTimeRDF"] = getRandomArbitrary(1000,5000);
      userSession["recentRdfQueries"].set(rdfParameters,initialQueryConfig["execTimeRDF"]);
  }
}
//Parse the queriesWith results string map to object array of queries
function parseQueriesWithResults(){
    return [...userSession["queriesWithResults"]].map((stringObject) => JSON.parse(stringObject))
}
function hasHTTPRequested(strQuery){
  return userSession["recentRequests"].has(strQuery);
}
function addStrQueryToRecentRequests(initialQueryConfig, strQuery){
  userSession["recentRequests"].add(strQuery);
  initialQueryConfig["key"] = userSession["nextQueryIndex"];
  userSession["nextQueryIndex"] += 1;
}
function fetchResult(initialQueryConfig){
  //1- first step : execute QDAG Query
  executeQDAGQuery(initialQueryConfig);
  //2- second step: execute RDF-3X QUERY
  if(initialQueryConfig['rdfToo'] === "true")
        executeRDFQuery(initialQueryConfig);
  // update user Queries
  userSession["queriesWithResults"].add(JSON.stringify(initialQueryConfig));
}
/************************************************************************/
/************************************ Routes  ***************************/
router.get('/demo', function(req, res, next) {
  init(req);
  res.send({"queriesWithResults": parseQueriesWithResults()});
});
/** Run Query generate with a fixed result (waiting to add QDAG) */
router.get('/run-query', function(req, res, next) {
  init(req);
  //Get the query parameters from the http request
  let initialQueryConfig = req.query;
  const strQuery = JSON.stringify(initialQueryConfig);
  //if the request has been already sent => it's been already in the bar chart
  if(hasHTTPRequested(strQuery)){
      console.log("Hihiiiiiiiiiiii");
      res.send({  "userQuery":{}  });
  }
  else {
      addStrQueryToRecentRequests(initialQueryConfig,strQuery);
      fetchResult(initialQueryConfig);
      res.send({ "userQuery":initialQueryConfig });
  }
});
/************************************************************************** */


module.exports = router;
