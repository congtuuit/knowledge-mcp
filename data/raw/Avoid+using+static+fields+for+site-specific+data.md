# Avoid using static fields for site-specific data

<div class="joplin-table-wrapper"><table><tbody><tr><th><p><strong>Project Manager</strong></p></th><th><p><a href="https://b-project.atlassian.net/wiki/people/712020:a032650c-f99a-49c7-83ea-0d1c7f748f10?ref=confluence" target="_blank">Dan Nguyen</a></p></th></tr><tr><td><p><strong>Contributors</strong></p></td><td><p><a href="https://b-project.atlassian.net/wiki/people/5b8e58668aaa0f2bd11fa513?ref=confluence" target="_blank">Kha Phạm</a> <a href="https://b-project.atlassian.net/wiki/people/6088deaf33d52500690bdc35?ref=confluence" target="_blank">Tuấn Trần</a> <a href="https://b-project.atlassian.net/wiki/people/631b0f5c62fe1e6eac6e6b31?ref=confluence" target="_blank">Thuận Nguyễn</a></p></td></tr><tr><td><p><strong>Informed</strong></p></td><td><p>AMS Members</p></td></tr><tr><td><p><strong>Objective</strong></p></td><td><p>Provide a simple guideline for the Development team to avoid using mutable static fields for site-specific or request-specific data in Sitecore multi-site applications.</p><p>The KB aims to:</p><ul><li>Prevent the use of mutable static<strong> </strong>fields for site-specific data.</li><li>Avoid cross-site data being shared or overwritten between requests.</li></ul></td></tr></tbody></table></div>

## 1\. Purpose

In a multi-site or multi-country application, we should avoid using a static field to store values that can change depending on the current site or request.

This is because a static field is shared by all instances of the class.

As a result, data from one site can accidentally be reused by another site.

## 2. Simple Example

Imagine we have two websites:

AU website

SG website

And we need to store the configuration path for each website.

### Incorrect

private static string \_configPath;

public Repository()

{

var siteName = GetCurrentSiteName();

\_configPath = \$"/sitecore/content/APWEB2/{0}/Settings/Brother Site Schema Markup";

}

When the AU website is accessed:

\_configPath = /sitecore/content/APWEB2/Australia/Settings/Brother Site Schema Markup

Then the SG website is accessed:

\_configPath = /sitecore/content/APWEB2/Singapore/Settings/Brother Site Schema Markup

Because \_configPath is static, both repository instances use the same variable.

The value can be overwritten by another request.

## 3. Why Is This Dangerous?

Consider two requests arriving at almost the same time:

Request 1: AU

Request 2: SG

They share the same static variable:

\_configPath

│

┌───────┴───────┐

│ │

AU request SG request

One request can change the value while another request is using it.

This can result in:

AU request → accidentally uses SG configuration

SG request → accidentally uses AU configuration

The problem can be difficult to reproduce because it may depend on request timing.

## 4. Recommended Approach for Sitecore

If a path depends on the current Sitecore site, use the current site's RootPath instead of storing the site-specific path in a static field.

### Recommended

For the repository, if the path is used multiple times, we can use an instance property:

private string ConfigFolder =>

\$"{Sitecore.Context.Site.RootPath}/Settings/Brother Site Schema Markup";

Then:

var siteInfoPath = \$"{ConfigFolder}/Site Schema Information";

This ensures that the path is based on the current Sitecore site.

## 5\. Quick Code Review Rule

When you see:

private static ...

ask:

"Can this value be different for different requests or websites?"

If yes, it should generally not be a mutable static field.