var express = require('express');
var router = express.Router();
var sess;
/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});
router.get('/demo', function(req, res, next) {
  if(sess === undefined){
      sess = req.session;
      sess["queries"] = [];
  }
  res.send({ queries: sess["queries"]});
});
router.get('/run-query', function(req, res, next) {
  sess["queries"].push("Alpha")
  /*userSession.queries.push(req.query)
  console.log(req.query);*/
  res.send({ 
       exec_time: 'Express',
       result:"Wait until addign QDAG to the process" 
  });
});
module.exports = router;
