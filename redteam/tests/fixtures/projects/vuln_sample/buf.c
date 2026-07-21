#include <stdio.h>
#include <string.h>

void greet(const char *name) {
  char buf[32];
  /* memory safety: unbounded copy of external data */
  strcpy(buf, name);
  printf("hello %s\n", buf);
}

int read_line(void) {
  char line[64];
  /* memory safety: gets has no bounds check */
  gets(line);
  return (int)strlen(line);
}

int add(int a, int b) { return a + b; }
