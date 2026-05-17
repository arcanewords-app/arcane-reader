# Navigation Map (Key Flows)

Human-readable navigation flows for Arcane Reader. Canonical route paths live in `.cursor/rules/routing.mdc` and `src/client/AppRouter.tsx`.

## Header → Pages

| Header element | Target                         | Condition    |
| -------------- | ------------------------------ | ------------ |
| Logo           | `/`                            | -            |
| Catalog        | `/`                            | -            |
| Projects       | `/projects`                    | author+ only |
| Admin          | `/admin/entities`              | admin+ only  |
| Info (⋮)       | About, Contact, Privacy, Terms | -            |
| Avatar         | `/profile`                     | user+        |
| Logout         | `/` (after logout)             | user+        |

## Catalog (HomePage)

| Action                          | Target                                                                |
| ------------------------------- | --------------------------------------------------------------------- | ------------ |
| Tab "All"                       | `/catalog`                                                            |
| Tab "My works"                  | `/catalog?filter=mine`                                                |
| Publication card                | `/p/:id`                                                              |
| Back to projects                | `/projects`                                                           | author+ only |
| Filter by author/translator/tag | `/catalog?author=id`, `?translator=id`, `?tag=id` (from entity click) |

## Profile → Reading

| Action               | Target                                     |
| -------------------- | ------------------------------------------ |
| Reading history card | `/p/:id` or `/p/:id/chapters/:cid/reading` |

## Projects

| Action                 | Target          |
| ---------------------- | --------------- |
| Project card           | `/projects/:id` |
| Sidebar "All projects" | `/projects`     |
| Sidebar project item   | `/projects/:id` |

## Project → Chapter

| Action       | Target                                |
| ------------ | ------------------------------------- |
| Chapter row  | `/projects/:id/chapters/:cid`         |
| Reading mode | `/projects/:id/chapters/:cid/reading` |

## Publication

| Action                          | Target                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| Back                            | `/catalog`                                                              |
| Chapter                         | `/p/:id/chapters/:cid/reading`                                          |
| Exit reading                    | `/p/:id`                                                                |
| Author / Translator / Tag click | `/catalog?author=id`, `?translator=id`, or `?tag=id` (filtered catalog) |
