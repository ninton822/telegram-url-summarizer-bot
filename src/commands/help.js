export default function register(bot) {
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Send a webpage link to summarize readable page or article text. Send a public x.com or twitter.com tweet/thread link to summarize the visible post content when X access is configured. Common failures include private pages, login walls, deleted content, rate limits, unsupported files, blocked sites, and inaccessible URLs."
    );
  });
}
