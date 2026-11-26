# Policy

Intentional removes the parts of social sites that decide for you what to look
at next. What's left is what you came for. Every rule, redirect and test in this
repository serves this policy; when in doubt, it decides.

## Allowed

- **A single resource opened by URL**: a video, a Short, a reel, a post, a
  thread, a profile. Links people send you must keep working.
- **What you chose to follow**: subscriptions, the Following timeline, joined
  communities, lists you built.
- **Search.** Typing a query is intentional. Recommendations injected into the
  results are not.
- **Your own space**: profile, messages, notifications, settings.
- **Conversation around a resource**: comments and replies under the thing you
  opened.

## Blocked

- **Algorithmic feeds**: home, For You, Discover, Explore, Trending, Popular.
- **Recommendations attached to a resource**: related videos, "more like this",
  "Discover more", end screens.
- **Next-item mechanics**: swiping to the next Short or reel, autoplaying the
  next video, infinite "keep watching" queues.
- **Growth injections**: "Who to follow", "People you may know", "Suggested for
  you", trending sidebars.
- **Entry points into blocked surfaces**: nav items and tabs that only lead to
  something blocked (the Shorts tab, the Explore button).

## Redirect over block

Blocking a page leaves people on an error screen. When a blocked surface has an
intentional counterpart, send people there instead:

| Blocked         | Intentional view                      |
| --------------- | ------------------------------------- |
| YouTube home    | Subscriptions                         |
| A YouTube Short | The same video in the regular player  |
| Instagram home  | Following (chronological)             |
| X Explore       | Home, with the Following tab selected |

Redirects need a one-time opt-in per blocker (see the [install guide](https://aymericbeaumet.github.io/intentional/#install)). Without
it, the list still hides the blocked surfaces.

## Edge cases

| Case                                         | Ruling                                                     | Why                                                                |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Shorts/reels shelves inside Subscriptions    | Hidden                                                     | The format is built for swiping; a single Short by URL still plays |
| Comments                                     | Kept                                                       | They belong to the resource you opened                             |
| Notifications                                | Kept                                                       | They're about you; turn them off in the site if they pull you in   |
| Search suggestions while typing              | Kept                                                       | You started the search                                             |
| Trending searches in the search box          | Hidden                                                     | Not about your query                                               |
| Autoplay toggle                              | Kept visible                                               | Hiding it would stop you from switching autoplay off               |
| Sites with no following-only view (LinkedIn) | Redirect to the most intentional page left (notifications) | Better than an algorithmic feed                                    |

## Limits we document instead of hiding

A filter list can't do everything. When a site makes the intentional view
impossible or fragile (no Following URL, server-side mixing of recommendations
into a feed), we say so in that site's `site.yaml` `limitations`. The install
pages and the website show them, so nobody believes they're protected when
they're not.
