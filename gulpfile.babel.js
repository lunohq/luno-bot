import gulp from 'gulp'
import loadPlugins from 'gulp-load-plugins'

// Load all of our Gulp plugins
const $ = loadPlugins()

// Lint a set of files
function lint(files) {
  return gulp.src(files)
    .pipe($.plumber())
    .pipe($.eslint())
    .pipe($.eslint.format())
    .pipe($.eslint.failOnError())
    .pipe($.jscs())
    .pipe($.jscs.reporter())
    .pipe($.jscs.reporter('fail'))
}

function lintBot() {
  return lint('bot/**/*.js')
}

function lintGulpfile() {
  return lint('gulpfile.babel.js')
}

// Lint our source code
gulp.task('lint-bot', lintBot)

// Lint this file
gulp.task('lint-gulpfile', lintGulpfile)

// Lint everything
gulp.task('lint', ['lint-bot', 'lint-gulpfile'])

// An alias of test
gulp.task('default', ['lint'])
