# CommitBoard

HTTP server which returns aggregated contributors for github organization. Steps:

- user sends HTTP request at `localhost:8080/org/${orgName}`
- backend uses Github API to fetch public repositories and its contributors (github token needed for authorizing requests)
- backend aggregates responses by summing up the individual contributors for each repository, for all public repositories owned by organization
- backend sends JSON response with sorted contributors in descending order (by contributions) to the client which may look like:

```json
{
  "count": 100,
  "contributors": [
    {
        "login": "username1",
        "contributions": 100
    },
    {
        "login": "username2",
        "contributions": 90
    },
    ..
  ]
}
```

- backend could also use caching with configurable expiration time to cache results for organizations
  What do you think? I think it can be a good exercise
  ￼
  . The goal will be first of all to make it work, but then to make it faster / more efficient! In fact, I already did it, I am curious if anyone can beat my benchmarks
  ￼
  . Skills that can be gained during implementation:
- working with Github API, reading & understanding docs
- app configuration parsing & handling github token
- parallel & concurrent programming (there will be lots of HTTP requests to make)
- caching
- working with JSON

create `.env` files as

```txt
GITHUB_TOKEN=ghp_your_github_token_here
CACHE_TTL=300 // seconds (default: 5 minutes)
```

run it, test it:

```sh
node index.js
```

and to get in a beautiful html return type:
`http://localhost:8080/org/asyncapi?html=true`

upon running the js file it ask from the user the org name, then ask to return in whether json or beautiful html,
if I directly hit `http://localhost:8080/org/asyncapi` so gives me normal **json** and
`http://localhost:8080/org/asyncapi?html=true` returns back the **html** table we asked.

done!!!
