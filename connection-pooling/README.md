# PostgreSQL Connection Pooling

```java
MetricRegistry metricRegistry = new MetricRegistry();
 
Timer timer = metricRegistry.timer("connectionTimer");
 
Slf4jReporter logReporter = Slf4jReporter
    .forRegistry(metricRegistry)
    .outputTo(LOGGER)
    .build();
 
for (int i = 0; i < connectionAcquisitionCount; i++) {
    long startNanos = System.nanoTime();
     
    try (Connection connection = dataSource.getConnection()) {}
     
    timer.update(
        System.nanoTime() - startNanos,
        TimeUnit.NANOSECONDS
    );
}
 
logReporter.report();
```


```java
HikariConfig config = new HikariConfig();
config.setJdbcUrl(dataSourceProvider().url());
config.setUsername(dataSourceProvider().username());
config.setPassword(dataSourceProvider().password());
 
HikariDataSource datasource = new HikariDataSource(config);
```