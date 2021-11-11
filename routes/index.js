var express = require('express');
var router = express.Router();
var userSession;

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}
function initSessionVariables(req){
  if(userSession === undefined){
    userSession = req.session;
    userSession["queryParamsGroups"] = new Set(["DB + Query"]);
    userSession["history"] = new Map();
    userSession["queriesSeries"] = new Map();
    userSession["rDF3XSeries"] = new Map();
    userSession["isRDFExecuted"] = false;
  }
}
function setResultParameters(initialQueryConfig,exectTime,nbrResult,result){
    initialQueryConfig["execTimeQDAG"] = exectTime;
    initialQueryConfig["nbrResult"] = nbrResult;
    initialQueryConfig["result"] = result; 
}


/*********************** Les fonction de formattage des variables de l'utilisateur ********************************/
function formatQueryGroup(queryParams){
  const spatStrategy = queryParams["isSpatial"] === "true" ? ',' + queryParams["spatialStrategy"]:'';    
  const withElag = queryParams["isElag"] === "true" ? ', With Pruning':"";     
  return queryParams["optimizer"] + withElag + spatStrategy;
}
function formatSeriesExecutions(array){
   const execAGconfig = {}; 
   array.forEach(str => {
     const obj = JSON.parse(str);
     execAGconfig[formatQueryGroup(obj)] = obj;
    });
    return execAGconfig;
}
function formatQueriesSeries(){
    let formatedQueriesSeriesMap = {};
    userSession["queriesSeries"].forEach((seriesExecutions,serieId) => {
       formatedQueriesSeriesMap[serieId] = formatSeriesExecutions(seriesExecutions);
    });
    return formatedQueriesSeriesMap;
}
function formatRDFXSeries(){
    let formatedRDFXSeries = {};
    userSession["rDF3XSeries"].forEach((execTime,serieId) => formatedRDFXSeries[serieId] = execTime);
    return formatedRDFXSeries;
}
function formatQueryParamsGroups(){
  let formatedQueryParamsGroups = [...userSession["queryParamsGroups"]];
  console.log("hipaa",formatedQueryParamsGroups);
  if(userSession["isRDFExecuted"])
      formatedQueryParamsGroups.push("RDF-3X");
  return formatedQueryParamsGroups;
}

/****************************************************************************************************************/


function executeQDAG(queryParams){
  let serieId = queryParams['currentDB'] + ',' + queryParams["queryName"]; 
  setResultParameters(queryParams,getRandomArbitrary(1000,5000),4000,"<mancity>\n</pogba>");
  if(userSession["queriesSeries"].has(serieId))
      userSession["queriesSeries"].get(serieId).push(JSON.stringify(queryParams));
  else 
      userSession["queriesSeries"].set(serieId,[JSON.stringify(queryParams)]);
  userSession["queryParamsGroups"].add(formatQueryGroup(queryParams));
  return queryParams;
}
function executeRDF(queryParams,rdfToo){
  let serieId = queryParams['currentDB'] + ',' + queryParams["queryName"]; 
  if(!userSession["rDF3XSeries"].has(serieId) && rdfToo === "true"){
      userSession["isRDFExecuted"] = true;
      userSession["rDF3XSeries"].set(serieId,getRandomArbitrary(1000,5000));
  }
}
function fetchQuerySpecificParams(queryParamsObj,paramsArr){
    let specificQueryParamsObj = {};
    for(let i = 1;i < paramsArr.length; i++)
        specificQueryParamsObj[paramsArr[i]] = queryParamsObj[paramsArr[i]];
    return JSON.stringify(specificQueryParamsObj);
}
function runQuery(queryParams,rdfToo){
  let serieId = queryParams['currentDB'] + ',' + queryParams["queryName"]; 
  const strQuery = fetchQuerySpecificParams(queryParams,["currentDB", "query","optimizer","isElag","isSpatial","spatialStrategy","queryName"]);
  if(userSession['history'].has(serieId)){
      let lastExecutions = userSession['history'].get(serieId);
      if(!lastExecutions.includes(strQuery)){
        lastExecutions.push(strQuery);
        executeQDAG(queryParams);
        executeRDF(queryParams,rdfToo)
      }else{
         executeRDF(queryParams,rdfToo)
         return formatQueriesSeries()[serieId][formatQueryGroup(queryParams)];
      }
  }else {
      userSession['history'].set(serieId,[strQuery]);
      executeQDAG(queryParams);
  }
  executeRDF(queryParams,rdfToo)
  return queryParams;
}

/************************************ Routes  ***************************/
router.get('/demo', function(req, res, next) {
  initSessionVariables(req);
  res.send({"queriesSeries": formatQueriesSeries(),"rDF3XSeries":formatRDFXSeries(),"queryParamsGroups":formatQueryParamsGroups(),
  isRDFExecuted:userSession["isRDFExecuted"]});
});
/** Run Query generate with a fixed result (waiting to add QDAG) */
router.get('/run-query', function(req, res, next) {
  //if the request has been already sent => it's been already in the bar chart
  const {currentDB,query,optimizer,isElag,isSpatial,spatialStrategy,queryName} = req.query;
  const qdagParams = {currentDB:currentDB, query:query,optimizer:optimizer,isElag:isElag,isSpatial:isSpatial
    ,spatialStrategy:spatialStrategy,queryName:queryName};
  let executedQuery = runQuery(qdagParams,req.query["rdfToo"]);
  res.send({"queriesSeries": formatQueriesSeries(),"rDF3XSeries":formatRDFXSeries(),"queryParamsGroups":formatQueryParamsGroups(),
  currentQuery:executedQuery,isRDFExecuted:userSession["isRDFExecuted"]});
});
/************************************************************************** */


module.exports = router;
