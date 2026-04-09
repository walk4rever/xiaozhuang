curl -s -w '\nHTTP:%{http_code} TIME:%{time_total}s' -XPOST https://relay.air7.fun/llm -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"你好，回复一个字"}],"max_tokens":10}'
