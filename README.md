# Cell Archive
Cell Archive is an open sourced file management web app created by St. Olaf Computer Science students to assist biologists in their research. 
## Description
The sites current purpose is automating a system to image process and count lipid droplets from Tetrahymena cells, however can be used as simple file management as well. While maintaining an organized space, Cell Archive contains features such as graphing, providing exportable raw data tables, hand counting lipid droplets, and working in group and individual projects. With the site layout, the respository can be forked and easily repurposed for any sorts of analysis.
## Dependencies
* Front end: JavaScript, HTML, CSS
* Back end: Python
* Database in Supabase (must create account)
* Webservice API hosted on Render (must create account)
* Code in GitHub
* (Not needed) Claude Code
## Installing
Fork the repository, but a few things must be done after:
* Look over any markdown files, especially **CLAUDE.md**. This will provide a preview of the entire project.
* Create an account with both Render and Supabase (free and paid options).
* Render provides API keys to run the site. After creating an account, you must replace the API keys in *app.js* with those given in your new account. 
* Supabase uses PostgreSQL and provides storage for the data with neat database layouts. Your Supabase URL and Secret Key will live in Render's environment variables for privacy. 
* Create the tables in Supabase using the SQL query code we provide.
## Authors
Brooke Barenz: GitHub @[barenz1-dev](https://github.com/barenz1-dev) \
Evan Olds: GitHub @[evan3olds](https://github.com/evan3olds)